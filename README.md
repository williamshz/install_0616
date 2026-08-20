# install_0616
CANN安装

## 单元测试

`index.html` 内联脚本的单元测试基于 vitest + jsdom，测试时不需要修改页面：
`tests/harness.mjs` 从 `index.html` 中提取内联脚本，用 istanbul 插桩后在 jsdom 中执行。

```bash
npm install
npm test        # 运行全部测试
npm run coverage  # 运行测试并输出覆盖率（coverage/html 为 HTML 报告）
```
