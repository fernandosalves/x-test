---
# JSON Report Format

The xtest CLI can emit machine-readable summaries via `--json <file|-|stdout>`. This document describes the structure, versioning policy, and usage tips.

## Enabling JSON Output

```bash
# Write to file
xtest run "tests/**/*.xtest" --json ./results/xtest.json

# Print to stdout (after human-readable reporters)
xtest run login.xtest --json -
```

During `xtest watch`, the file is overwritten on each rebuild ensuring the latest run is always available.

## Payload Structure

Top-level envelope:

```json
{
  "version": 1,
  "generatedAt": "2026-03-14T22:20:31.123Z",
  "passed": true,
  "totals": {
    "total": 6,
    "passed": 6,
    "failed": 0,
    "skipped": 1,
    "duration": 842
  },
  "files": [
    {
      "file": "tests/login.xtest",
      "passed": true,
      "total": 3,
      "totalPass": 3,
      "totalFail": 0,
      "totalSkipped": 0,
      "duration": 312,
      "suites": [ /* SuiteResult[] */ ]
    }
  ]
}
```

### Field Reference

| Field | Type | Description |
| --- | --- | --- |
| `version` | number | Schema revision. Incremented when breaking changes occur. |
| `generatedAt` | ISO8601 string | Timestamp for when the report was produced. |
| `passed` | boolean | `true` if all scenarios across all files passed. |
| `totals` | object | Aggregate statistics across the whole batch. |
| `totals.total` | number | Total executed scenarios (skipped excluded). |
| `totals.passed` | number | Count of passed scenarios. |
| `totals.failed` | number | Count of failed scenarios. |
| `totals.skipped` | number | Count of skipped scenarios. |
| `totals.duration` | number | Total execution time in milliseconds. |
| `files[]` | array | Per-file run results mirroring `RunResult`. |
| `files[].file` | string | Absolute or relative path to the `.xtest` file. |
| `files[].passed` | boolean | `true` if the file’s scenarios passed. |
| `files[].total*` | numbers | Same semantics as top-level totals but scoped to the file. |
| `files[].suites` | array | Raw `SuiteResult[]` payload for detailed inspection. |

## Consuming the Report

- **CI Upload** – Publish `results/xtest.json` as an artifact. Downstream pipelines can parse failures without scraping stdout.
- **Editor Integrations** – Poll or watch the JSON file during `xtest watch` to show inline diagnostics.
- **Telemetry** – Ingest into dashboards to track suite health over time.

## Versioning Policy

Breaking schema changes increment `version`. Consumers should:

1. Verify `version` before parsing.
2. Reject or warn on unknown versions.
3. Consider sending telemetry when the schema changes to ease migration.

For strict validation, use the accompanying [JSON Schema](./json-report.schema.json).
