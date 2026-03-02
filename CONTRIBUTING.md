# Contributing

感谢你参与本项目维护。

## 适用范围

本仓库当前是浏览器扩展项目，贡献以“小步快改、可回退”为原则。

## 分支命名

- 功能：`feature/<short-name>`
- 修复：`fix/<short-name>`
- 文档：`docs/<short-name>`
- 重构：`refactor/<short-name>`

示例：`fix/manifest-paths`

## 提交信息规范

建议使用简洁前缀：

- `feat:` 新功能
- `fix:` 缺陷修复
- `docs:` 文档修改
- `refactor:` 重构
- `chore:` 杂项维护

示例：`fix: update manifest paths after folder refactor`

## Pull Request 要求

- 说明本次改动目的与影响范围
- 说明是否涉及 `manifest.json` 路径、权限或注入范围变更
- 若改动 UI，请附简短说明或截图
- 若改动流程逻辑，请附最小复现/验证步骤

## 本项目最小检查清单

提交前请至少确认：

- [ ] `manifest.json` 路径可用
- [ ] `src/popup/popup.html` 能正常打开并加载脚本
- [ ] 内容脚本在目标页面可注入
- [ ] 文档链接无断链（`README` 与 `docs/`）

## 安全与隐私

- 不要提交任何 API Key 或账号凭据
- 不要把真实教学数据写入仓库
- 涉及权限变更（如 host_permissions）时，请在 PR 中明确原因
