# go-gin adapter: pinned dependency versions (Tahap 0)

Recorded 2026-09-29 against the local toolchain **go1.23.3 windows/amd64**, with
`GOTOOLCHAIN=local` so Go can never silently download a newer toolchain. Every generated
`go.mod` pins `go 1.23.3` and these versions. Any bump must re-run the check below.

## How a version was chosen

For each module, the `go` directive of candidate versions was read straight from the module
proxy (`https://proxy.golang.org/<module>/@v/<version>.mod`). The newest version whose `go`
directive is at most 1.23 was then resolved with `go get` under `GOTOOLCHAIN=local` in the
spike module. MVS resolved the whole graph without raising the `go` line and without adding a
`toolchain` line.

Status legend:
- **tested**: compiled and exercised by the Tahap 0 spike;
- **compiled**: in the spike's build graph but not exercised yet;
- **checked**: `go` directive verified from the proxy only, not built yet (first built in the
  tahap noted).

| Module | Version | `go` directive | Newer versions rejected (their `go` line) | Status |
|---|---|---|---|---|
| github.com/gin-gonic/gin | **v1.10.1** | 1.20 | v1.12.0 (1.25.0). v1.11.0 (1.23.0) was rejected on purpose, see note 1 | tested |
| gorm.io/gorm | **v1.31.2** | 1.18 | none (latest) | compiled (DB tests need `TEST_DATABASE_URL`) |
| gorm.io/driver/postgres | **v1.6.0** | 1.20 | v1.6.1 to v1.6.3 (1.25.0) | compiled |
| github.com/jackc/pgx/v5 | v5.6.0 (indirect, chosen by MVS) | 1.23.0 or lower | n/a | compiled |
| github.com/golang-migrate/migrate/v4 | **v4.19.0** | 1.23.0 | v4.19.1 (1.24.0), v4.20.x (1.25+) | compiled |
| github.com/rabbitmq/amqp091-go | **v1.15.0** | 1.20 | none (latest) | compiled (no broker, by decision D17) |
| github.com/golang-jwt/jwt/v5 | **v5.3.1** | 1.21 | none (latest) | checked (Tahap 8) |
| golang.org/x/sync | **v0.16.0** | 1.23.0 | v0.17.0 to v0.19.0 (1.24.0), v0.20.0+ (1.25+) | checked (Tahap 6/11) |
| golang.org/x/time | **v0.12.0** | 1.23.0 | v0.13.0 (1.24.0), v0.16.0 (1.26.0) | checked (Tahap 11) |
| github.com/prometheus/client_golang | **v1.23.2** | 1.23.0 | v1.24.x (1.25.0) | checked (Tahap 11) |
| go.opentelemetry.io/otel | **v1.38.0** | 1.23.0 | v1.40.0 (1.24.0), v1.46.0 (1.25.0) | checked (Tahap 11; contrib versions matched then) |
| github.com/google/uuid | **v1.6.0** | none declared | none (latest) | tested |
| go.uber.org/goleak | **v1.3.0** | 1.20 | none (latest) | tested |
| github.com/go-playground/validator/v10 | v10.27.0 (indirect via gin) | n/a | n/a | tested (via gin binding) |

## Notes

1. **gin v1.11.0 imports `github.com/quic-go/quic-go/http3` from `gin.go:21`.** That links
   the whole QUIC/HTTP3 stack into every binary (`go list -deps github.com/gin-gonic/gin`
   lists `quic-go/*` packages). The service does not serve HTTP/3, so v1.10.1 was chosen.
   Its `quic` dependency count is 0, and the binding test passes unchanged ("ponytail":
   don't link what isn't used).
2. **`gorm.io/datatypes` is not used.** Since the target is Postgres-only, a JSON column is
   declared as `gorm:"type:jsonb;serializer:json"`. The `json` serializer is registered in
   `gorm.io/gorm@v1.31.2/schema/serializer.go:35`, so no extra module is needed.
3. **amqp091-go publish concurrency (corrects the plan).** In v1.15.0,
   `Channel.PublishWithDeferredConfirm` takes `ch.m.Lock()` for the whole send
   (`channel.go`, body of `PublishWithDeferredConfirm`). Publishes on one channel are
   therefore already serialized by the library, and the adapter must **not** add its own
   mutex around publish. Confirms come from `PublishWithDeferredConfirmWithContext` followed
   by `DeferredConfirmation.WaitContext` (`confirms.go:244`), after `Channel.Confirm(false)`
   (`channel.go:2099`). A dropped connection surfaces through `Connection.NotifyClose` and
   `Channel.NotifyClose` (`channel.go:712`), which is what the single reconnect goroutine
   listens on.
4. **golang-migrate** uses the `pgx5://` scheme, registered by importing
   `github.com/golang-migrate/migrate/v4/database/pgx/v5`, plus `source/iofs` over an
   `embed.FS`. A `postgres://` DSN is rewritten to `pgx5://` in one helper.
5. **Race detector.** `go test -race` on this machine fails with
   `go: -race requires cgo; enable cgo by setting CGO_ENABLED=1`, because there is no C
   compiler. Race testing is therefore **not** a gate until gcc (MinGW-w64) is installed
   (decision D14; the user deferred the install until the generator is final).
6. **`golangci-lint` is not installed.** The generated `.golangci.yml` is only exercised once
   the user installs the linter locally.

## Re-check command

```bash
export GOTOOLCHAIN=local
curl -s https://proxy.golang.org/<module>/@v/<version>.mod | grep '^go '
```
