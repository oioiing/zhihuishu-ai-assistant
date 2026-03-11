// 智慧树 AI 助教 - 分析面板模块

const MANUAL_EDITOR_STYLES = {
    panel: `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 92%;
        max-width: 920px;
        max-height: 88vh;
        background: #ececec;
        border: 1px solid #d4d4d4;
        border-radius: 24px;
        box-shadow: 0 14px 30px rgba(0, 0, 0, 0.12);
        z-index: 10000;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #242424;
        box-sizing: border-box;
    `,
    header: `
        background: #e3e3e3;
        color: #242424;
        padding: 18px 20px;
        font-weight: 700;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #d1d1d1;
        font-size: 22px;
        letter-spacing: 0.2px;
    `,
    content: `
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 24px 30px;
        background: #ececec;
        box-sizing: border-box;
    `,
    section: 'background:#f0f0f0;border:1px solid #d2d2d2;border-radius:18px; width:100%; max-width:100%; box-sizing:border-box; overflow:hidden;',
    sectionPill: 'display:inline-flex;align-items:center;background:#dfdfdf;border:1px solid #cecece;border-radius:999px;padding:4px 10px;font-size:14px;font-weight:700;'
};

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseQuestionsWithOptions(rawText) {
    const normalized = String(rawText || '')
        .replace(/\r\n/g, '\n')
        .replace(/\u00A0/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!normalized) return [];

    // 预清洗：修复粘连题号/粘连选项（如 "had been9."、"crying.A"、"coldC."）
    const withBreaks = normalized
        .replace(/([A-Za-z\u4e00-\u9fa5\)\]】>.!?！？_])(\d{1,3}(?:\.\d+)?\.\s+(?=[A-Z(“"'‘’\u4e00-\u9fa5]))/g, '$1\n$2')
        .replace(/([A-Za-z\u4e00-\u9fa5])([A-D][\.\)）:：]\s+)/g, '$1 $2');

    // 匹配题目块（支持 1. / 1.1. 等）
    const questionRegex = /(?:^|\n)\s*(\d{1,3}(?:\.\d+)?\.)\s*([\s\S]*?)(?=\n\s*\d{1,3}(?:\.\d+)?\.|\n\s*(?:答案|参考答案|标准答案|Answer|Answers)\b|$)/g;
    const blocks = [...withBreaks.matchAll(questionRegex)]
        .map((m) => {
            const number = String(m[1] || '').trim(); // "1." or "1.1."
            const content = String(m[2] || '').trim();
            return { number, content };
        })
        .filter((b) => b.content);

    return blocks.map((block) => {
        // 统一空白
        const oneLine = block.content.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        const questionNumber = block.number.replace(/\.$/, ''); // 去掉末尾的点，如 "1." -> "1"

        // 序列识别 A->B->C->D，避免把题干中的 "A chair" 误当成选项 A。
        const isBoundaryChar = (ch) => !ch || /[\s_＿﹍﹎﹏\(\[\{<"'“‘,，。;；:：!！?？]/.test(ch);
        const isMarkerTail = (ch) => /[\.\)）:：\s]/.test(ch || '');

        const allMarkers = [];
        for (let i = 0; i < oneLine.length; i++) {
            const key = oneLine.charAt(i);
            if (!/[A-D]/.test(key)) continue;
            const prev = i > 0 ? oneLine.charAt(i - 1) : '';
            const next = i + 1 < oneLine.length ? oneLine.charAt(i + 1) : '';
            if (isBoundaryChar(prev) && isMarkerTail(next)) {
                allMarkers.push({ key, index: i });
            }
        }

        const byKey = { A: [], B: [], C: [], D: [] };
        allMarkers.forEach((m) => {
            if (byKey[m.key]) byKey[m.key].push(m.index);
        });

        const getTextBetween = (startIndex, endIndex) => {
            let s = startIndex + 1;
            while (s < oneLine.length && /[\.\)）:：\s]/.test(oneLine.charAt(s))) s++;
            return oneLine.slice(s, endIndex).trim();
        };

        const sequenceCandidates = [];
        for (const a of byKey.A) {
            const b = byKey.B.find((x) => x > a);
            const c = byKey.C.find((x) => x > (b ?? Number.MAX_SAFE_INTEGER));
            const d = byKey.D.find((x) => x > (c ?? Number.MAX_SAFE_INTEGER));
            if (b == null || c == null || d == null) continue;

            const textA = getTextBetween(a, b);
            const textB = getTextBetween(b, c);
            const textC = getTextBetween(c, d);
            const textD = getTextBetween(d, oneLine.length);

            const lens = [textA.length, textB.length, textC.length, textD.length];
            let penalty = 0;
            if (lens.some((n) => n < 1)) penalty += 100;
            if (lens.some((n) => n > 120)) penalty += 60;
            if (/which|indicates|for\s+sitting\s+on|________|_{3,}|\?/.test(textA.toLowerCase())) penalty += 45;
            penalty += Math.max(0, b - a - 140); // A过长通常是题干误切

            sequenceCandidates.push({ a, b, c, d, textA, textB, textC, textD, penalty });
        }

        let options = [];
        let stem = oneLine;

        if (sequenceCandidates.length > 0) {
            const best = sequenceCandidates.sort((x, y) => x.penalty - y.penalty)[0];
            stem = oneLine.slice(0, best.a).trim();
            options = [
                { key: 'A', text: best.textA },
                { key: 'B', text: best.textB },
                { key: 'C', text: best.textC },
                { key: 'D', text: best.textD }
            ].filter((o) => o.text);
        } else if (allMarkers.length >= 2) {
            // 兜底：按首次出现顺序切分，避免极端文本下完全无选项。
            const seen = new Set();
            const ordered = allMarkers.filter((m) => {
                if (seen.has(m.key)) return false;
                seen.add(m.key);
                return true;
            });

            const first = ordered[0];
            stem = oneLine.slice(0, first.index).trim();
            for (let i = 0; i < ordered.length; i++) {
                const cur = ordered[i];
                const next = ordered[i + 1];
                const text = getTextBetween(cur.index, next ? next.index : oneLine.length);
                if (text) options.push({ key: cur.key, text });
            }
        }

        return {
            number: questionNumber,
            stem,
            options,
            raw: block.content
        };
    });
}

function buildStructuredReferenceAnswerFromExtractedContents(extractedAttachmentContents) {
    if (!Array.isArray(extractedAttachmentContents) || extractedAttachmentContents.length === 0) return '';

    const normalizeText = (text) => String(text || '')
        .replace(/\r\n/g, '\n')
        .replace(/\u00A0/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const splitAnswerAndExplanation = (text) => {
        const raw = String(text || '').trim();
        if (!raw) return { answer: '', explanation: '' };

        const explanationMatch = raw.match(/(?:解析|解释|理由|because|explanation)\s*[：:]/i);
        if (explanationMatch && explanationMatch.index > 0) {
            return {
                answer: raw.slice(0, explanationMatch.index).trim(),
                explanation: raw.slice(explanationMatch.index).trim()
            };
        }

        return { answer: raw, explanation: '' };
    };

    const normalizeAnswerLetters = (rawAnswer) => {
        return String(rawAnswer || '')
            .toUpperCase()
            .replace(/[，,\/、\s]+/g, '')
            .trim();
    };

    const isValidObjectiveAnswer = (answer) => /^[A-D]{1,4}$/.test(String(answer || ''));

    const extractAnswerEntries = (text) => {
        const normalized = normalizeText(text);
        if (!normalized) return [];

        // 仅当文档里存在明确“答案/参考答案/标准答案”区块时才尝试结构化，避免把题干误识别为答案。
        const sectionMatch = normalized.match(/(?:^|\n)\s*(?:答案|参考答案|标准答案|answer|answers)\s*[:：]?\s*\n([\s\S]*)$/i);
        if (!sectionMatch || !sectionMatch[1]) return [];
        const answerRegion = sectionMatch[1];

        const regex = /(?:^|\n)\s*(\d{1,3})[\.\)）:：、-]?\s*([A-Da-d](?:\s*[,，\/、]\s*[A-Da-d]){0,3})\b\s*([\s\S]*?)(?=(?:\n\s*\d{1,3}[\.\)）:：、-]?\s*[A-Da-d])|$)/g;
        const entries = [];
        let match;

        while ((match = regex.exec(answerRegion)) !== null) {
            const index = Number(match[1]);
            const answerRaw = normalizeAnswerLetters(match[2]);
            if (!isValidObjectiveAnswer(answerRaw)) continue;
            const trailing = String(match[3] || '').trim();
            const parsed = splitAnswerAndExplanation(trailing);

            entries.push({
                index,
                answer: answerRaw,
                explanation: parsed.explanation || parsed.answer || ''
            });
        }

        return entries;
    };

    const allQuestions = [];
    const allEntries = [];

    extractedAttachmentContents.forEach((item) => {
        const text = String(item?.content || '');
        if (!text) return;

        const parsedQuestions = parseQuestionsWithOptions(text);
        if (parsedQuestions.length > 0) {
            allQuestions.push(...parsedQuestions);
        }

        const parsedEntries = extractAnswerEntries(text);
        if (parsedEntries.length > 0) {
            allEntries.push(...parsedEntries);
        }
    });

    if (allEntries.length === 0) return '';

    // 去重：同题号优先保留第一个有效答案
    const entryMap = new Map();
    allEntries
        .sort((a, b) => a.index - b.index)
        .forEach((entry) => {
            if (!entryMap.has(entry.index) && entry.answer) {
                entryMap.set(entry.index, entry);
            }
        });

    if (entryMap.size === 0) return '';

    // 可靠性保护：题号至少2题且从1开始，避免误提取单个脏答案（如“1.W”）。
    const sortedIndexes = Array.from(entryMap.keys()).sort((a, b) => a - b);
    const hasReasonableShape = sortedIndexes.length >= 2 && sortedIndexes[0] === 1;
    if (!hasReasonableShape) return '';

    const buildExamStyleExplanation = (entry) => {
        const question = allQuestions.find((q) => Number(q.number) === Number(entry.index));
        const answerKey = String(entry.answer || '').charAt(0);
        const matchedOption = question?.options?.find((o) => String(o.key || '').toUpperCase() === answerKey);
        const optionText = String(matchedOption?.text || '').trim();

        if (entry.explanation && entry.explanation.length > 8) {
            return entry.explanation;
        }

        if (optionText) {
            return `本题选${entry.answer}。依据题干语义与语法功能判断，${entry.answer}项“${optionText}”最符合题意。`;
        }

        return `本题选${entry.answer}。依据题干关键词和语法规则综合判断，该项最符合题意。`;
    };

    const compactAnswerLine = Array.from(entryMap.values())
        .map((entry) => `${entry.index}.${entry.answer}`)
        .join(' ');

    const explainLines = Array.from(entryMap.values()).map((entry) => {
        const explanation = buildExamStyleExplanation(entry);
        return `${entry.index}. 答案：${entry.answer}\n   解析：${explanation}`;
    });

    return `答案：${compactAnswerLine}\n\n逐题解析：\n${explainLines.join('\n')}`.trim();
}

function buildExtractedAttachmentSectionHtml(attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) return '';

    const cardsHtml = attachments.map((item, idx) => {
        const fileName = escapeHtml(item?.fileName || `附件${idx + 1}`);
        const text = String(item?.content || '');
        const parsed = parseQuestionsWithOptions(text);
        const renderFallback = parsed.length === 0;

        const parsedHtml = parsed.map((q) => {
            // 完整的题目（题号+题干）作为一个加粗块
            const questionBlock = `<div style="font-size:15px;font-weight:700;color:#1e293b;line-height:1.8;margin-bottom:${q.options.length > 0 ? '12px' : '0'};">${q.number}. ${escapeHtml(q.stem || q.raw || `第${q.number}题`)}</div>`;
            
            // 选项单独成行，每行一个选项
            const optionsHtml = q.options.length > 0
                ? `<div style="padding-left:8px;display:grid;gap:6px;">${q.options.map((o) => `<div style="font-size:14px;line-height:1.7;color:#444;"><span style="display:inline-block;min-width:28px;font-weight:600;color:#2563eb;">${escapeHtml(o.key)}.</span> ${escapeHtml(o.text)}</div>`).join('')}</div>`
                : '';
            
            return `
                <div style="padding:16px 18px;border:1px solid #e0e0e0;border-radius:12px;background:#ffffff;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                    ${questionBlock}
                    ${optionsHtml}
                </div>
            `;
        }).join('');

        const fallbackHtml = `<pre style="margin:0;font-size:13px;line-height:1.65;color:#333;white-space:pre-wrap;word-break:break-word;">${escapeHtml(text)}</pre>`;

        return `
            <details open style="border:1px solid #d8d8d8;border-radius:12px;background:#f7f7f7;padding:10px 12px;">
                <summary style="cursor:pointer;font-weight:700;color:#2f2f2f;">📄 ${fileName}（提取字符: ${text.length}）</summary>
                <div style="margin-top:10px;display:grid;gap:10px;">
                    ${renderFallback ? fallbackHtml : parsedHtml}
                </div>
            </details>
        `;
    }).join('');

    return `
        <section style="${MANUAL_EDITOR_STYLES.section}padding:18px 20px;">
            <div style="${MANUAL_EDITOR_STYLES.sectionPill}margin-bottom:12px;">📚 附件提取全文（题号/选项）</div>
            <div style="display:grid;gap:12px;">${cardsHtml}</div>
        </section>
    `;
}

// 显示作业分析结果面板（可编辑版本）
function showAnalysisPanel(analysis, isManual = false) {
    appLogger.info('🎨 [作业分析] 创建分析结果面板...', isManual ? '(手动模式)' : '(AI生成)');

    // 移除已有的面板
    const existingPanel = document.getElementById('zh-analysis-panel');
    if (existingPanel) existingPanel.remove();

    const panel = document.createElement('div');
    panel.id = 'zh-analysis-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', '手动设置评分标准');
    panel.style.cssText = MANUAL_EDITOR_STYLES.panel;

    const header = document.createElement('div');
    header.style.cssText = MANUAL_EDITOR_STYLES.header;
    header.innerHTML = `
        <span>手动设置评分标准</span>
        <button id="zh-panel-close-btn" aria-label="关闭设置面板" style="background: #efefef; border: 1px solid #cecece; color: #333; width: 34px; height: 34px; border-radius: 999px; cursor: pointer; font-size: 18px;">×</button>
    `;

    const closeBtn = header.querySelector('#zh-panel-close-btn');
    closeBtn.addEventListener('click', () => panel.remove());

    const content = document.createElement('div');
    content.style.cssText = MANUAL_EDITOR_STYLES.content;

    const previousCriteriaItems = Array.isArray(analysis.gradingCriteriaItems)
        ? analysis.gradingCriteriaItems
        : (Array.isArray(AUTO_GRADING_STATE.autoGradingConditions.gradingCriteriaItems)
            ? AUTO_GRADING_STATE.autoGradingConditions.gradingCriteriaItems
            : []);

    const defaultCriteriaNames = ['论点清晰度', '论据充分性', '语言逻辑', '创新性'];
    const defaultScores = [30, 30, 20, 20];

    let criteriaItems = [];
    if (previousCriteriaItems.length > 0) {
        criteriaItems = previousCriteriaItems.map((item, idx) => ({
            id: `item-${Date.now()}-${idx}`,
            name: (item?.name || '').trim(),
            score: Number.isFinite(Number(item?.score)) ? Math.min(100, Math.max(0, Math.round(Number(item.score)))) : 0
        }));
    } else if (Array.isArray(analysis.gradingCriteria) && analysis.gradingCriteria.length > 0) {
        criteriaItems = analysis.gradingCriteria.map((text, idx) => {
            const parsed = parseLegacyCriterionText(text);
            return {
                id: `item-${Date.now()}-${idx}`,
                name: parsed.name,
                score: parsed.score > 0 ? parsed.score : Math.min(100, Math.max(0, Math.round(defaultScores[idx] ?? 0)))
            };
        });
    } else {
        criteriaItems = defaultCriteriaNames.map((name, idx) => ({
            id: `item-${Date.now()}-${idx}`,
            name,
            score: Math.min(100, Math.max(0, Math.round(defaultScores[idx] ?? 0)))
        }));
    }

    const initialAdviceRich = analysis.gradingAdviceRich || '';
    const initialAdvicePlain = analysis.gradingAdvice || '';
    const initialReferenceAnswerType = analysis.referenceAnswerType || AUTO_GRADING_STATE.autoGradingConditions.referenceAnswerType || '';
    const structuredReferenceAnswer = buildStructuredReferenceAnswerFromExtractedContents(analysis.extractedAttachmentContents);
    const aiReferenceAnswer = analysis.referenceAnswer || '';
    const manualSavedReferenceAnswer = AUTO_GRADING_STATE.autoGradingConditions.referenceAnswer || '';
    const initialReferenceAnswer = aiReferenceAnswer || ((!isManual && structuredReferenceAnswer) ? structuredReferenceAnswer : manualSavedReferenceAnswer);

    // 构建附件信息HTML（如果有的话）
    const attachmentHTML = analysis.attachments && analysis.attachments.length > 0
        ? `
            <section style="background:#f0f0f0;border:1px solid #d2d2d2;border-radius:18px;padding:18px 20px 20px; width:100%; max-width:100%; box-sizing:border-box; overflow:hidden;">
                <div style="${MANUAL_EDITOR_STYLES.sectionPill}margin-bottom:14px;">📎 附件信息</div>
                <div style="display:flex;flex-direction:column;gap:10px;">
                    ${analysis.attachments.map((file) => `
                        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border:1px solid #e0e0e0;border-radius:10px;font-size:14px;color:#333;">
                            <span style="font-size:16px;">📄</span>
                            <span style="flex:1;word-break:break-all;">${file.name}</span>
                        </div>
                    `).join('')}
                    <div style="font-size:12px;color:#666;margin-top:4px;">✓ 共 ${analysis.attachments.length} 个附件</div>
                </div>
            </section>
        `
        : '';

    const extractedAttachmentSectionHtml = buildExtractedAttachmentSectionHtml(analysis.extractedAttachmentContents);

    content.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:20px; width:100%; max-width:100%; box-sizing:border-box;">
            ${attachmentHTML}
            ${extractedAttachmentSectionHtml}
            <section style="background:#f0f0f0;border:1px solid #d2d2d2;border-radius:18px;padding:18px 20px 20px; width:100%; max-width:100%; box-sizing:border-box; overflow:hidden;">
                <div style="${MANUAL_EDITOR_STYLES.sectionPill}margin-bottom:14px;">作业类型</div>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <label style="font-size:15px;color:#4b4b4b;">作业类型分类</label>
                    <input id="zh-homework-type" type="text" value="${analysis.homeworkType || ''}" placeholder="例：论述题"
                        style="width:100%;max-width:100%;box-sizing:border-box;padding:16px 18px;border:1px solid #cfcfcf;border-radius:12px;font-size:16px;outline:none;background:#f7f7f7;color:#2b2b2b;">
                    <label style="font-size:15px;color:#4b4b4b;">作业类型说明</label>
                    <textarea id="zh-type-explanation" placeholder="可选，例：本题考察..."
                        style="width:100%;max-width:100%;box-sizing:border-box;padding:16px 18px;border:1px solid #cfcfcf;border-radius:12px;font-size:16px;min-height:60px;outline:none;resize:none;background:#f7f7f7;color:#2b2b2b;overflow:hidden;">${analysis.typeExplanation || ''}</textarea>
                </div>
            </section>

            <section style="${MANUAL_EDITOR_STYLES.section}padding:18px 20px;">
                <div style="${MANUAL_EDITOR_STYLES.sectionPill}margin-bottom:12px;">答案部分</div>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <label id="zh-reference-answer-label" style="font-size:15px;color:#4b4b4b;">参考答案（选择/填空）</label>
                    <textarea id="zh-reference-answer" placeholder="例：1:A 2:C 3:B 或 1-5:ACBDA"
                        style="width:100%;max-width:100%;box-sizing:border-box;padding:16px 18px;border:1px solid #cfcfcf;border-radius:12px;font-size:16px;min-height:92px;outline:none;resize:none;background:#f7f7f7;color:#2b2b2b;overflow:hidden;">${initialReferenceAnswer}</textarea>
                    <div id="zh-reference-answer-hint" style="font-size:12px;color:#666;line-height:1.5;">用于选择题/填空题的固定答案；保存后在页面未识别到标准答案时自动作为兜底。</div>
                </div>
            </section>

            <section style="${MANUAL_EDITOR_STYLES.section}padding:18px 20px 16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;">
                    <div style="${MANUAL_EDITOR_STYLES.sectionPill}">评分标准</div>
                    <button id="zh-toggle-name-mode" type="button" aria-label="切换评分项名称显示模式" style="background:#f3f3f3;color:#2d2d2d;border:1px solid #cfcfcf;padding:7px 11px;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;">名称显示：自动换行</button>
                </div>
                <div id="zh-criteria-list" style="display:flex;flex-direction:column;gap:10px; width:100%; max-width:100%; box-sizing:border-box;"></div>
                <div style="display:flex;justify-content:flex-end;margin-top:12px;">
                    <button id="zh-add-criterion-btn" aria-label="添加评分项" style="background:#f3f3f3;color:#2d2d2d;border:1px solid #cfcfcf;padding:9px 14px;border-radius:12px;cursor:pointer;font-size:15px;font-weight:600;">+ 添加评分项</button>
                </div>
                <div id="zh-score-sum-hint" style="margin-top:10px;font-size:13px;color:#646464;line-height:1.5;">提示：各项分值总和建议为100分</div>
                <div style="margin-top:6px;font-size:12px;color:#6a6a6a;line-height:1.5;">拖拽手柄可排序；手柄聚焦后可用 ↑/↓ 调整顺序；Ctrl+Enter 保存，Esc 关闭。</div>
            </section>

            <section style="${MANUAL_EDITOR_STYLES.section}padding:18px 20px;">
                <div style="${MANUAL_EDITOR_STYLES.sectionPill}margin-bottom:12px;">批改建议与注意事项</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                    <button id="zh-rt-bold" type="button" aria-label="加粗选中文本" style="background:#f5f5f5;border:1px solid #cfcfcf;border-radius:10px;padding:7px 11px;cursor:pointer;font-size:14px;">加粗</button>
                    <button id="zh-rt-list" type="button" aria-label="将选中文本转换为列表" style="background:#f5f5f5;border:1px solid #cfcfcf;border-radius:10px;padding:7px 11px;cursor:pointer;font-size:14px;">列表</button>
                    <button id="zh-rt-template" type="button" aria-label="插入评语模板" style="background:#f5f5f5;border:1px solid #cfcfcf;border-radius:10px;padding:7px 11px;cursor:pointer;font-size:14px;">插入评语模板</button>
                </div>
                <div id="zh-grading-advice-editor" contenteditable="true" aria-label="批改建议编辑区" tabindex="0"
                    style="min-height:80px;background:#f7f7f7;border:1px solid #cfcfcf;border-radius:12px;padding:18px 18px;font-size:16px;line-height:1.8;outline:none;color:#2b2b2b;white-space:pre-wrap;overflow-wrap:anywhere;overflow:hidden;">${initialAdviceRich || initialAdvicePlain}</div>
            </section>

            <div style="display:flex;justify-content:space-between;gap:12px;margin-top:8px;">
                <button id="zh-cancel-analysis-btn" style="min-width:120px;background:#f3f3f3;color:#2d2d2d;border:1px solid #cfcfcf;padding:12px 16px;border-radius:12px;cursor:pointer;font-size:16px;font-weight:600;">取消</button>
                <button id="zh-save-analysis-btn" style="min-width:140px;background:#2a2a2a;color:#fff;border:1px solid #2a2a2a;padding:12px 18px;border-radius:12px;cursor:pointer;font-size:16px;font-weight:600;">保存设置</button>
            </div>
        </div>
    `;

    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);

    const criteriaListEl = panel.querySelector('#zh-criteria-list');
    const scoreSumHintEl = panel.querySelector('#zh-score-sum-hint');
    const toggleNameModeBtn = panel.querySelector('#zh-toggle-name-mode');
    const saveAnalysisBtn = panel.querySelector('#zh-save-analysis-btn');
    const homeworkTypeInput = panel.querySelector('#zh-homework-type');
    const typeExplanationInput = panel.querySelector('#zh-type-explanation');
    const referenceAnswerInput = panel.querySelector('#zh-reference-answer');
    const referenceAnswerLabel = panel.querySelector('#zh-reference-answer-label');
    const referenceAnswerHint = panel.querySelector('#zh-reference-answer-hint');
    const closePanel = () => panel.remove();

    function autoResizeTextarea(textarea, minHeight = 60) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        const newHeight = Math.max(minHeight, textarea.scrollHeight);
        textarea.style.height = `${newHeight}px`;
    }

    if (typeExplanationInput) {
        autoResizeTextarea(typeExplanationInput, 60);
        typeExplanationInput.addEventListener('input', () => autoResizeTextarea(typeExplanationInput, 60));
    }

    if (referenceAnswerInput) {
        autoResizeTextarea(referenceAnswerInput, 92);
        referenceAnswerInput.addEventListener('input', () => autoResizeTextarea(referenceAnswerInput, 92));
    }

    function inferReferenceAnswerTypeByHomeworkType(homeworkTypeText) {
        const text = String(homeworkTypeText || '').toLowerCase();
        if (!text) return '';

        const objectiveKeywords = ['选择', '填空', '客观', '单选', '多选', 'choice', 'blank', 'objective'];
        const essayKeywords = ['作文', '论述', '写作', 'essay', '主观', '问答', '分析'];

        if (objectiveKeywords.some(k => text.includes(k))) return 'objective';
        if (essayKeywords.some(k => text.includes(k))) return 'model_essay';
        return '';
    }

    let referenceAnswerType = initialReferenceAnswerType || inferReferenceAnswerTypeByHomeworkType(analysis.homeworkType || '');

    function updateReferenceAnswerUI() {
        if (!referenceAnswerInput || !referenceAnswerLabel || !referenceAnswerHint) return;

        if (referenceAnswerType === 'model_essay') {
            referenceAnswerLabel.textContent = '参考范文（作文/论述）';
            referenceAnswerInput.placeholder = '例：围绕主题给出结构清晰、论证完整的范文（可分段）';
            referenceAnswerHint.textContent = '用于作文/论述题的参考范文；保存后在评语生成时可作为参考标准。';
        } else {
            referenceAnswerLabel.textContent = '参考答案（选择/填空）';
            referenceAnswerInput.placeholder = '例：1:A 2:C 3:B 或 1-5:ACBDA';
            referenceAnswerHint.textContent = '用于选择题/填空题的固定答案；保存后在页面未识别到标准答案时自动作为兜底。';
            if (!referenceAnswerType) {
                referenceAnswerHint.textContent += '（作业类型无法判断时默认按客观题显示）';
            }
        }

        autoResizeTextarea(referenceAnswerInput, 92);
    }

    updateReferenceAnswerUI();

    if (homeworkTypeInput) {
        homeworkTypeInput.addEventListener('input', () => {
            const inferredType = inferReferenceAnswerTypeByHomeworkType(homeworkTypeInput.value);
            if (inferredType) {
                referenceAnswerType = inferredType;
                updateReferenceAnswerUI();
            }
        });
    }

    let criteriaNameDisplayMode = AUTO_GRADING_STATE.criteriaNameDisplayMode === 'single-line' ? 'single-line' : 'wrap';
    let dragSourceId = null;
    const dropPlaceholder = document.createElement('div');
    dropPlaceholder.style.cssText = 'height:44px;border:1px dashed #8f8f8f;border-radius:10px;background:#ededed;';

    function updateNameModeButtonText() {
        if (!toggleNameModeBtn) return;
        toggleNameModeBtn.textContent = criteriaNameDisplayMode === 'single-line'
            ? '名称显示：单行省略'
            : '名称显示：自动换行';
    }

    function applyNameDisplayMode(nameInput) {
        if (criteriaNameDisplayMode === 'single-line') {
            nameInput.style.whiteSpace = 'nowrap';
            nameInput.style.overflow = 'hidden';
            nameInput.style.textOverflow = 'ellipsis';
            nameInput.style.height = '50px';
            nameInput.style.resize = 'none';
        } else {
            nameInput.style.whiteSpace = 'pre-wrap';
            nameInput.style.overflow = 'hidden';
            nameInput.style.textOverflow = 'clip';
            nameInput.style.resize = 'none';
            nameInput.style.height = 'auto';
        }
    }

    function normalizeScore(value) {
        const parsed = parseInt(String(value), 10);
        if (!Number.isFinite(parsed)) return 0;
        return Math.min(100, Math.max(0, parsed));
    }

    function getScoreSum() {
        return criteriaItems.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
    }

    function isCompactCriteriaLayout() {
        return panel.clientWidth < 760;
    }

    function updateScoreSumHint() {
        const total = getScoreSum();
        scoreSumHintEl.textContent = `提示：各项分值总和建议为100分（当前：${total}分）`;
        scoreSumHintEl.style.color = total === 100 ? '#2f6f3d' : (total > 100 ? '#b42318' : '#8a5a00');
    }

    function renderCriteriaItems() {
        if (dropPlaceholder.parentNode) {
            dropPlaceholder.remove();
        }
        criteriaListEl.innerHTML = '';
        const compactLayout = isCompactCriteriaLayout();
        criteriaItems.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'zh-criterion-row';
            row.draggable = true;
            row.dataset.id = item.id;
            row.style.cssText = `
                display:grid;
                grid-template-columns: ${compactLayout ? '22px minmax(0, 1fr) 24px' : '22px minmax(0, 1fr) 52px 72px 24px'};
                align-items:start;
                gap:${compactLayout ? '8px 10px' : '8px'};
                background:#f7f7f7;
                border:1px solid #d0d0d0;
                border-radius:12px;
                padding:12px 14px;
                width:100%;
                max-width:100%;
                box-sizing:border-box;
            `;
            row.innerHTML = `
                <button type="button" class="zh-drag-handle" data-item-id="${item.id}" aria-label="拖拽排序 第${index + 1}项" title="拖拽排序（支持键盘↑/↓）" style="display:flex;align-items:center;justify-content:center;cursor:grab;color:#666;font-size:12px;width:20px;height:20px;border-radius:999px;border:1px solid #cfcfcf;background:#ececec;">⋮⋮</button>
                <textarea class="zh-criterion-name" aria-label="评分项名称 ${index + 1}" placeholder="评分项 ${index + 1}" title="${(item.name || '').replace(/"/g, '&quot;')}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:14px 16px;border:1px solid #cfcfcf;border-radius:10px;font-size:15px;background:#fff;outline:none;line-height:1.45;resize:none;overflow:hidden;overflow-wrap:anywhere;${compactLayout ? 'grid-column:2 / 3;' : ''}">${item.name || ''}</textarea>
                <div class="zh-criterion-score-label" style="display:flex;align-items:center;justify-content:flex-end;gap:6px;color:#444;font-size:12px;white-space:nowrap;">分值</div>
                <div class="zh-criterion-score-wrap" style="display:flex;flex-direction:column;gap:4px;">
                    <input type="number" class="zh-criterion-score" aria-label="评分项分值 ${index + 1}" min="0" max="100" step="1" value="${normalizeScore(item.score)}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:14px 12px;border:1px solid #cfcfcf;border-radius:10px;font-size:15px;background:#fff;outline:none;">
                    <div class="zh-score-warning" style="display:none;font-size:11px;color:#b42318;line-height:1.3;">已自动限制为 100 分以内</div>
                </div>
                <button class="zh-remove-criterion" aria-label="删除评分项 ${index + 1}" title="删除" style="background:none;border:none;cursor:pointer;font-size:16px;color:#666;">🗑️</button>
            `;

            if (compactLayout) {
                const scoreLabel = row.querySelector('.zh-criterion-score-label');
                const scoreWrap = row.querySelector('.zh-criterion-score-wrap');
                const removeBtn = row.querySelector('.zh-remove-criterion');
                const dragHandle = row.querySelector('.zh-drag-handle');

                dragHandle.style.gridColumn = '1 / 2';
                dragHandle.style.gridRow = '1 / 2';

                removeBtn.style.gridColumn = '3 / 4';
                removeBtn.style.gridRow = '1 / 2';

                scoreLabel.style.gridColumn = '1 / 2';
                scoreLabel.style.gridRow = '2 / 3';
                scoreLabel.style.justifyContent = 'flex-start';

                scoreWrap.style.gridColumn = '2 / 4';
                scoreWrap.style.gridRow = '2 / 3';
            }

            const nameInput = row.querySelector('.zh-criterion-name');
            const scoreInput = row.querySelector('.zh-criterion-score');
            const scoreWarning = row.querySelector('.zh-score-warning');
            const removeBtn = row.querySelector('.zh-remove-criterion');
            const dragHandle = row.querySelector('.zh-drag-handle');

            function autoResizeNameInput() {
                if (criteriaNameDisplayMode === 'single-line') {
                    nameInput.style.height = '50px';
                    return;
                }
                nameInput.style.height = 'auto';
                const nextHeight = Math.max(50, nameInput.scrollHeight);
                nameInput.style.height = `${nextHeight}px`;
            }

            applyNameDisplayMode(nameInput);
            setTimeout(autoResizeNameInput, 0);

            nameInput.addEventListener('input', () => {
                item.name = nameInput.value;
                nameInput.title = item.name;
                setTimeout(autoResizeNameInput, 0);
            });

            scoreInput.addEventListener('input', () => {
                const raw = Number(scoreInput.value);
                const overflow = Number.isFinite(raw) && raw > 100;
                scoreWarning.style.display = overflow ? 'block' : 'none';
                scoreInput.style.borderColor = overflow ? '#d92d20' : '#cfcfcf';
                item.score = normalizeScore(scoreInput.value);
                updateScoreSumHint();
            });

            scoreInput.addEventListener('blur', () => {
                const normalized = normalizeScore(scoreInput.value);
                item.score = normalized;
                scoreInput.value = String(normalized);
                scoreWarning.style.display = 'none';
                scoreInput.style.borderColor = '#cfcfcf';
                updateScoreSumHint();
            });

            removeBtn.addEventListener('click', () => {
                criteriaItems = criteriaItems.filter((ci) => ci.id !== item.id);
                renderCriteriaItems();
            });

            row.addEventListener('dragstart', (event) => {
                dragSourceId = item.id;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.id);
                row.style.opacity = '0.55';
            });
            row.addEventListener('dragend', () => {
                dragSourceId = null;
                if (dropPlaceholder.parentNode) {
                    dropPlaceholder.remove();
                }
                row.style.opacity = '1';
            });
            row.addEventListener('dragover', (event) => {
                event.preventDefault();
                if (!dragSourceId || dragSourceId === item.id) return;
                if (dropPlaceholder.parentNode !== criteriaListEl || dropPlaceholder.nextSibling !== row) {
                    criteriaListEl.insertBefore(dropPlaceholder, row);
                }
                row.style.borderColor = '#9d9d9d';
            });
            row.addEventListener('dragleave', () => {
                row.style.borderColor = '#d0d0d0';
            });
            row.addEventListener('drop', (event) => {
                event.preventDefault();
                row.style.borderColor = '#d0d0d0';
                if (dropPlaceholder.parentNode) {
                    dropPlaceholder.remove();
                }
                const dragId = event.dataTransfer.getData('text/plain');
                if (!dragId || dragId === item.id) return;

                const fromIndex = criteriaItems.findIndex((ci) => ci.id === dragId);
                const toIndex = criteriaItems.findIndex((ci) => ci.id === item.id);
                if (fromIndex < 0 || toIndex < 0) return;

                const [moved] = criteriaItems.splice(fromIndex, 1);
                criteriaItems.splice(toIndex, 0, moved);
                renderCriteriaItems();
            });

            dragHandle.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                event.preventDefault();

                const currentIndex = criteriaItems.findIndex((ci) => ci.id === item.id);
                if (currentIndex < 0) return;

                const targetIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1;
                if (targetIndex < 0 || targetIndex >= criteriaItems.length) return;

                const [moved] = criteriaItems.splice(currentIndex, 1);
                criteriaItems.splice(targetIndex, 0, moved);
                renderCriteriaItems();

                requestAnimationFrame(() => {
                    const nextHandle = panel.querySelector(`.zh-drag-handle[data-item-id="${item.id}"]`);
                    if (nextHandle) nextHandle.focus();
                });
            });

            criteriaListEl.appendChild(row);
        });

        updateScoreSumHint();
    }

    renderCriteriaItems();
    updateNameModeButtonText();

    if (toggleNameModeBtn) {
        toggleNameModeBtn.addEventListener('click', () => {
            criteriaNameDisplayMode = criteriaNameDisplayMode === 'single-line' ? 'wrap' : 'single-line';
            persistCriteriaNameDisplayMode(criteriaNameDisplayMode);
            updateNameModeButtonText();
            renderCriteriaItems();
        });
    }

    window.addEventListener('resize', () => {
        if (!document.body.contains(panel)) return;
        renderCriteriaItems();
    });

    panel.querySelector('#zh-add-criterion-btn').addEventListener('click', () => {
        criteriaItems.push({
            id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: '',
            score: 0
        });
        renderCriteriaItems();
    });

    panel.querySelector('#zh-cancel-analysis-btn').addEventListener('click', () => {
        panel.remove();
    });

    const adviceEditor = panel.querySelector('#zh-grading-advice-editor');
    const rtBoldBtn = panel.querySelector('#zh-rt-bold');
    const rtListBtn = panel.querySelector('#zh-rt-list');
    const rtTemplateBtn = panel.querySelector('#zh-rt-template');

    function isSelectionInsideAdviceEditor() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return false;
        const range = selection.getRangeAt(0);
        const commonNode = range.commonAncestorContainer;
        return adviceEditor.contains(commonNode) || commonNode === adviceEditor;
    }

    function setCaretAfterNode(node) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function insertNodeAtCursor(node) {
        adviceEditor.focus();
        const tailNode = node instanceof DocumentFragment ? node.lastChild : node;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !isSelectionInsideAdviceEditor()) {
            adviceEditor.appendChild(node);
            if (tailNode) setCaretAfterNode(tailNode);
            return;
        }

        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(node);
        if (tailNode) setCaretAfterNode(tailNode);
    }

    function wrapSelectionWithTag(tagName) {
        adviceEditor.focus();
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !isSelectionInsideAdviceEditor()) {
            const node = document.createElement(tagName);
            node.textContent = '加粗文本';
            insertNodeAtCursor(node);
            return;
        }

        const range = selection.getRangeAt(0);
        if (range.collapsed) {
            const node = document.createElement(tagName);
            node.textContent = '加粗文本';
            range.insertNode(node);
            setCaretAfterNode(node);
            return;
        }

        const wrapper = document.createElement(tagName);
        wrapper.appendChild(range.extractContents());
        range.insertNode(wrapper);
        setCaretAfterNode(wrapper);
    }

    function insertUnorderedList() {
        adviceEditor.focus();
        const selection = window.getSelection();
        let selectedText = '';
        if (selection && selection.rangeCount > 0 && isSelectionInsideAdviceEditor()) {
            selectedText = selection.toString();
        }

        const lines = (selectedText || '')
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean);
        const finalLines = lines.length > 0 ? lines : ['列表项'];

        const ul = document.createElement('ul');
        ul.style.margin = '0 0 0 18px';
        ul.style.padding = '0';
        finalLines.forEach((line) => {
            const li = document.createElement('li');
            li.textContent = line;
            ul.appendChild(li);
        });

        insertNodeAtCursor(ul);
    }

    function insertTemplateText() {
        const template = '【评语模板】\n- 优点：\n- 可改进点：\n- 建议：';
        const frag = document.createDocumentFragment();
        const lines = template.split('\n');
        lines.forEach((line, idx) => {
            if (idx > 0) frag.appendChild(document.createElement('br'));
            frag.appendChild(document.createTextNode(line));
        });
        insertNodeAtCursor(frag);
    }

    [rtBoldBtn, rtListBtn, rtTemplateBtn].forEach((btn) => {
        btn.addEventListener('mousedown', (event) => event.preventDefault());
    });

    rtBoldBtn.addEventListener('click', () => {
        wrapSelectionWithTag('strong');
        setTimeout(autoResizeAdviceEditor, 0);
    });
    rtListBtn.addEventListener('click', () => {
        insertUnorderedList();
        setTimeout(autoResizeAdviceEditor, 0);
    });
    rtTemplateBtn.addEventListener('click', () => {
        insertTemplateText();
        setTimeout(autoResizeAdviceEditor, 0);
    });

    function autoResizeAdviceEditor() {
        if (!adviceEditor) return;
        adviceEditor.style.height = 'auto';
        const newHeight = Math.max(80, adviceEditor.scrollHeight);
        adviceEditor.style.height = `${newHeight}px`;
    }

    if (adviceEditor) {
        autoResizeAdviceEditor();
        adviceEditor.addEventListener('input', autoResizeAdviceEditor);
        adviceEditor.addEventListener('paste', () => setTimeout(autoResizeAdviceEditor, 0));
    }

    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closePanel();
            return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            if (saveAnalysisBtn) saveAnalysisBtn.click();
        }
    });

    panel.querySelector('#zh-save-analysis-btn').addEventListener('click', () => {
        appLogger.info('💾 [评分标准] 开始保存...');

        const homeworkType = homeworkTypeInput.value.trim();
        const typeExplanation = panel.querySelector('#zh-type-explanation').value.trim();
        const gradingAdviceRich = adviceEditor.innerHTML.trim();
        const gradingAdvice = adviceEditor.innerText.trim();
        const referenceAnswer = referenceAnswerInput ? referenceAnswerInput.value.trim() : '';
        const inferredReferenceAnswerType = inferReferenceAnswerTypeByHomeworkType(homeworkType);
        const finalReferenceAnswerType = inferredReferenceAnswerType || referenceAnswerType || 'objective';

        const normalizedCriteriaItems = criteriaItems
            .map((item) => ({
                name: (item.name || '').trim(),
                score: normalizeScore(item.score)
            }))
            .filter((item) => item.name.length > 0);

        if (!homeworkType) {
            showNotification('⚠️ 请填写作业类型', '#FF9800');
            panel.querySelector('#zh-homework-type').focus();
            return;
        }

        if (normalizedCriteriaItems.length === 0) {
            showNotification('⚠️ 请至少添加一条评分标准', '#FF9800');
            return;
        }

        const scoreTotal = normalizedCriteriaItems.reduce((sum, item) => sum + item.score, 0);
        const gradingCriteria = normalizedCriteriaItems.map((item) => `${item.name}（${item.score}分）`);

        AUTO_GRADING_STATE.autoGradingConditions = migrateAutoGradingConditions({
            gradingCriteria,
            gradingCriteriaItems: normalizedCriteriaItems,
            gradingAdvice,
            gradingAdviceRich,
            referenceAnswerType: finalReferenceAnswerType,
            referenceAnswer,
            commonMistakes: Array.isArray(analysis.commonMistakes) ? analysis.commonMistakes : [],
            homeworkType,
            typeExplanation,
            isSet: true
        });

        persistManualCriteriaConditions();

        appLogger.info('✅ [评分标准] 保存成功:', AUTO_GRADING_STATE.autoGradingConditions);

        if (scoreTotal !== 100) {
            showNotification(`✅ 已保存（当前总分 ${scoreTotal}）`, '#4CAF50');
        } else {
            showNotification('✅ 评分标准已保存！自动批改时将使用这些标准', '#4CAF50');
        }

        panel.remove();
    });

    appLogger.info('✅ [作业分析] 面板已显示，等待用户编辑...');
}
