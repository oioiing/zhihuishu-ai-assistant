/**
 * 简单的 DOCX 文本提取器
 * 不依赖外部库，直接解析 ZIP 结构提取 document.xml 中的文本
 */

/**
 * 从 DOCX 文件的 ArrayBuffer 中提取纯文本
 * @param {ArrayBuffer} arrayBuffer - DOCX 文件的二进制数据
 * @returns {Promise<string>} 提取的文本内容
 */
async function extractTextFromDocx(arrayBuffer) {
    try {
        const dataView = new DataView(arrayBuffer);
        
        // 验证 ZIP 文件头（PK\x03\x04）
        if (dataView.getUint32(0, true) !== 0x04034b50) {
            throw new Error('不是有效的 DOCX 文件（ZIP 格式）');
        }
        
        // 查找 word/document.xml 文件
        const documentXml = await findFileInZip(arrayBuffer, 'word/document.xml');
        if (!documentXml) {
            throw new Error('未找到 document.xml');
        }
        
        // 解析 XML 提取文本
        const text = extractTextFromXml(documentXml);
        return text;
        
    } catch (error) {
        console.error('❌ [DOCX解析] 失败:', error.message);
        throw error;
    }
}

/**
 * 在 ZIP 文件中查找指定文件
 * @param {ArrayBuffer} zipData - ZIP 文件数据
 * @param {string} fileName - 要查找的文件名
 * @returns {string|null} 文件内容（文本）
 */
async function findFileInZip(zipData, fileName) {
    const dataView = new DataView(zipData);
    const decoder = new TextDecoder('utf-8');
    let offset = 0;
    
    // 遍历 ZIP 中央目录查找文件
    while (offset < zipData.byteLength - 4) {
        const signature = dataView.getUint32(offset, true);
        
        // Local file header signature: 0x04034b50
        if (signature === 0x04034b50) {
            const filenameLength = dataView.getUint16(offset + 26, true);
            const extraFieldLength = dataView.getUint16(offset + 28, true);
            const compressedSize = dataView.getUint32(offset + 18, true);
            const compressionMethod = dataView.getUint16(offset + 8, true);
            
            // 读取文件名
            const filenameBytes = new Uint8Array(zipData, offset + 30, filenameLength);
            const currentFileName = decoder.decode(filenameBytes);
            
            // 检查是否是目标文件
            if (currentFileName === fileName) {
                const dataOffset = offset + 30 + filenameLength + extraFieldLength;
                const compressedData = new Uint8Array(zipData, dataOffset, compressedSize);
                
                // 如果是存储模式（未压缩）
                if (compressionMethod === 0) {
                    return decoder.decode(compressedData);
                }
                
                // 如果是 DEFLATE 压缩
                if (compressionMethod === 8) {
                    try {
                        // 使用浏览器内置的 DecompressionStream（Chrome 80+）
                        const stream = new Blob([compressedData]).stream();
                        const decompressedStream = stream.pipeThrough(
                            new DecompressionStream('deflate-raw')
                        );
                        const decompressedBlob = await new Response(decompressedStream).blob();
                        const decompressedText = await decompressedBlob.text();
                        return decompressedText;
                    } catch (e) {
                        console.warn('⚠️ [解压] 浏览器解压失败，尝试简单提取:', e.message);
                        // 降级：返回压缩数据的文本表示（可能乱码，但总比没有好）
                        return decoder.decode(compressedData);
                    }
                }
            }
            
            // 跳到下一个条目
            offset += 30 + filenameLength + extraFieldLength + compressedSize;
        } else {
            offset++;
        }
    }
    
    return null;
}

/**
 * 从 DOCX XML 中提取纯文本
 * @param {string} xml - document.xml 的内容
 * @returns {string} 提取的文本
 */
function extractTextFromXml(xml) {
    // 提取所有 <w:t> 标签中的文本
    const textRegex = /<w:t[^>]*>(.*?)<\/w:t>/gs;
    const texts = [];
    let match;
    
    while ((match = textRegex.exec(xml)) !== null) {
        const text = match[1]
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
        texts.push(text);
    }
    
    // 处理段落分隔（<w:p> 标签）
    const paragraphs = xml.split(/<w:p[\s>]/);
    const result = [];
    
    for (const para of paragraphs) {
        const paraTexts = [];
        let paraMatch;
        while ((paraMatch = textRegex.exec(para)) !== null) {
            const text = paraMatch[1]
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'");
            paraTexts.push(text);
        }
        if (paraTexts.length > 0) {
            result.push(paraTexts.join(''));
        }
    }
    
    return result.join('\n').trim();
}

// 导出函数（在 Service Worker 中可用）
if (typeof self !== 'undefined' && typeof self.extractTextFromDocx === 'undefined') {
    self.extractTextFromDocx = extractTextFromDocx;
}
