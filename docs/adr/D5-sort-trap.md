# D5 — 游标分页下禁用全局列排序

- 状态：已采纳
- 日期：2026-08-18

## 决策

`ListObjectsV2` 只按 key 字典序返回。仅当 `hasNextPage === false` 时启用 size / mtime 排序，否则灰掉并 tooltip。

## 理由

只加载了前 3000 个对象时按 size 降序，得到的是这 3000 里的最大值，用户会当成全局结果。
