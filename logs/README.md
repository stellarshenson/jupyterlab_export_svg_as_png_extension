# Logs

Build and test output. Log files are gitignored; this README is not.

- `make-install.log` - `make install`: jlpm build, wheel build, pip install
- `galata-packaged-<version>.log` - the Playwright/Galata suite against the installed wheel
- `galata-mutantA.log` - a mutation the suite did **not** catch: adding `.jp-RenderedMarkdown` to the container list, neutralised by the exactly-one gate because the fixture holds two graphics
- `galata-mutantB.log` - a mutation the suite did catch: restoring the historical unbounded descendant scan, which turns the DEF-1 guard test red
- `probe-imageviewer.log` - the DEF-19 root-cause probe: instrumented `URL.createObjectURL` / `revokeObjectURL` in the live document to show the image viewer's blob URL being revoked from the image's own load handler
- `ci-eef4de2.log` - the GitHub Actions watcher for the DEF-19 fix commit: polls the Actions API until Build and Check Release conclude, then prints the verdict
