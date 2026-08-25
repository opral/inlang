# Version Control

Inlang uses [Lix](https://lix.dev) for versioning, history, review, change proposals, rollback, and merging.

Inlang defines the localization format and TMS surface. Lix provides the version-control layer underneath the `.inlang` project, so localization changes can be reviewed and merged without turning a vendor database into the source of truth.

An `.inlang` project is canonically a portable snapshot. For repositories, it can be unpacked into plain files so localization changes can be reviewed alongside code. The packed file is the canonical format; the unpacked directory is the repository-friendly representation.

Use this layer for:

- History of localization changes
- Change proposals and review
- Rollback
- Merging distributed edits
- Reviewable updates from translation tools, CI, and AI agents
