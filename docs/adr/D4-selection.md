# D4 — 大列表多选：反向集合

- 状态：已采纳
- 日期：2026-08-18

## 决策

```ts
type Selection =
  | { mode: 'include'; keys: Set<string> }
  | { mode: 'all'; except: Set<string> }
```

不用 TanStack Table 的 `rowSelection`。行高固定 28px。右键菜单只挂容器。

## 理由

R2 key 最长 1024 字节。`Record<string, boolean>` 存二十万项会让 state 膨胀到几十 MB，且每次 setState 浅拷贝整个对象。「全选二十万再取消三个」只有反向集合撑得住。
