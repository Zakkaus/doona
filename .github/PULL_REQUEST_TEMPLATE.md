<!--
AI may help you write this; unverified content may not be submitted.
可以用 AI 辅助撰写，但提交前须自行核实全部内容。

State each fact once; do not restate the title, diff or template.
同一件事只写一次，不要重复标题、代码改动或模板内容。
No filler, praise, summaries of your own work or emoji.
不写客套话、夸赞和自我总结，不用表情符号。
Paste only relevant log lines; link or collapse long output.
日志只贴相关的几行；较长的输出请附链接或折叠。
Say what you could not verify.
没有验证过的地方请注明。
-->

Closes # <!-- Related issue / 相关 issue -->

## Problem / 问题

<!-- One short paragraph: the defect or unmet need.
用一小段说明缺陷或尚未满足的需求。
-->

## How I fixed it / 解决方法

<!-- One short paragraph: how the change addresses it and why.
用一小段说明改了什么，以及为什么这样改。
-->

## Verified / 验证

<!-- Record commands, environment and observed results for CONTRIBUTING.md's gates, including applicable CI gates; say what you could not verify. Link long evidence.
列出你执行过的 CONTRIBUTING.md 检查（包括相关的 CI 检查）、执行环境和结果，并注明没有验证的部分。较长的输出请附链接。
-->

---

<!-- Each commit needs an English `type(scope): subject` and a short English body.
每个 commit 都需要英文的 `type(scope): subject` 标题和简短的英文正文。
-->

- [ ] I understand this change and answer for every line
- [ ] This branch is based on the current main
- [ ] I ran the repository's gates and recorded the results in Verified
- [ ] Each commit is one coherent change
- [ ] If behaviour changed, I updated the documentation
- [ ] If interface text changed, I updated `en.json` and every complete language's catalogue
- [ ] If interface appearance changed, I attached light and dark screenshots
- [ ] If the API contract changed, I ran `pnpm gen:api` and `pnpm check:gen`
- [ ] I checked the boxes above without reading them
- [ ] I am an AI agent, and this content was submitted without human review

Check only true claims. An applicable unchecked box or a false claim closes the pull request.

只勾选属实的选项。适用的选项没有勾选，或勾选的内容不属实，PR 会被关闭。
