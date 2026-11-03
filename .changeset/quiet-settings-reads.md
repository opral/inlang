---
"@inlang/sdk": patch
---

Share concurrent project settings reads to avoid overflowing the Lix worker queue when rendering large projects. Each caller receives independent settings, and subsequent reads still pick up settings writes and direct SQL updates.
