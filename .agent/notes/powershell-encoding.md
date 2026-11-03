# PowerShell 编码与语法坑

读者：AI
类型：笔记
权威：本机 Windows PowerShell 5.1 环境下的已知坑与规避写法
状态：2026-11-03 建立（均为实测踩过的）
依赖：`../../AGENT.md` §2 §3

## 1 无 BOM 的 UTF-8 脚本会被按 ANSI 解码

**现象**：`.ps1` 里写了中文注释或字符串，执行时报"字符串缺少终止符"之类的语法错误，报错位置看着完全正常。

**原因**：PowerShell 5.1 读无 BOM 文件时按当前 ANSI 代码页（本机 936）解码，UTF-8 的多字节中文被拆成乱码字节，其中的 `0x22` 会吃掉引号。

**处置**：
- `scripts/*.ps1` 一律 **UTF-8 with BOM**；
- 或者脚本内**全用 ASCII**（注释也用英文），中文只出现在它读写的数据文件里。

## 2 命令行里的中文不可信

**现象**：`git commit -m "中文说明"` 提交出来的信息是乱码或问号。

**处置**：中文一律走 **UTF-8 文件**。

```powershell
git commit -F .git\COMMIT_MSG_TMP.txt
gh api --method POST --input body.json repos/{owner}/{repo}/issues
```

回读时也不能信控制台回显（代码页 936 会把正确中文显示成乱码，也会把乱码显示成问号），
用 `git --no-pager log -1 --format=%B` 看原始字节。

## 3 `curl` 是 `Invoke-WebRequest` 的别名

**现象**：`curl -s https://...` 报参数不认识。

**处置**：要么写 `curl.exe`，要么用 `Invoke-RestMethod`。注意 `Invoke-RestMethod` 发中文会编码损坏，需要发中文时改用 Node 或 Python 脚本。

## 4 嵌套引号必失败

**现象**：`python -c "..."` 里再套一层引号，PowerShell 先解析坏了。

**处置**：写临时 `.py` / `.mjs` 文件再执行，不要试图在命令行里套引号。

## 5 格式串里的花括号

**现象**：`-f` 格式化含 JSON 的字符串时报"格式项无效"。

**处置**：用字符串拼接，或把 `{` 写成 `{{`。本项目统一用拼接。

## 6 其它

| 坑 | 处置 |
|---|---|
| `$LASTEXITCODE` 在 `;` 串联里容易看错 | 每条命令单独一行，或 `if ($?) { ... }` |
| 输出编码不是 UTF-8 | 需要精确字节时写文件再读，不看管道 |
| 长命令折行 | 用反引号续行，反引号后不能有空格 |
