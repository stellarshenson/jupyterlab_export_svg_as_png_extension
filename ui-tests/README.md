# Integration Testing

This folder contains the integration tests of the extension.

They are defined using [Playwright](https://playwright.dev/docs/intro) test runner
and [Galata](https://github.com/jupyterlab/jupyterlab/tree/main/galata) helper.

The Playwright configuration is defined in [playwright.config.js](./playwright.config.js).

The JupyterLab server configuration to use for the integration test is defined
in [jupyter_server_test_config.py](./jupyter_server_test_config.py).

The default configuration will produce video for failing tests and an HTML report.

> There is a UI mode that you may like; see [that video](https://www.youtube.com/watch?v=jF0yA-JLQW0).

## Run the tests

> All commands are assumed to be executed from the root directory

> [!IMPORTANT]
> The test server pins its port and does not fall back, and the suite never
> adopts a server it did not start. If you have your own JupyterLab on 8888,
> set `JUPYTER_TEST_PORT` to a free port - it is read by both
> `playwright.config.js` and `jupyter_server_test_config.py`:
>
> ```sh
> JUPYTER_TEST_PORT=8899 jlpm playwright test
> ```
>
> The suite also runs against whatever labextensions the ambient Python
> environment has installed, while CI installs only this wheel plus core. Tests
> are written to be immune to that difference; keep them that way by scoping
> DOM selectors to the main area and matching menu items by command id.

To run the tests, you need to:

1. Compile the extension:

```sh
jlpm install
jlpm build:prod
```

> Check the extension is installed in JupyterLab.

2. Install test dependencies (needed only once):

```sh
cd ./ui-tests
jlpm install
jlpm playwright install
cd ..
```

3. Execute the [Playwright](https://playwright.dev/docs/intro) tests:

```sh
cd ./ui-tests
jlpm playwright test
```

Test results will be shown in the terminal. In case of any test failures, the test report
will be opened in your browser at the end of the tests execution; see
[Playwright documentation](https://playwright.dev/docs/test-reporters#html-reporter)
for configuring that behavior.

> [!WARNING]
> Do not pipe the run through `tee`. The pipeline exits with `tee`'s status, not
> Playwright's, so a suite whose server never started reports success. Redirect,
> or turn on `pipefail`:
>
> ```sh
> jlpm playwright test > ../logs/galata.log 2>&1; echo "exit: $?"
> set -o pipefail && jlpm playwright test 2>&1 | tee ../logs/galata.log
> ```

## Dependency pinning

Galata reaches into JupyterLab's DOM, so its minor tracks JupyterLab's: galata 5.6
pairs with JupyterLab 4.6. Pair it with a newer lab and _every_ test times out inside
`page.goto()` before any test body runs - a uniform timeout across the whole suite is
the signature, where a real defect fails a subset.

- `@jupyterlab/galata` is pinned to the minor that matches the JupyterLab this
  extension targets, not left on the range the project template scaffolded
- `@playwright/test` is declared at galata's own floor. Declaring a lower range makes
  yarn install two copies once the ranges stop overlapping; the runner then loads one
  and the spec's `test` import comes from the other, which fails as `No tests found`
  on CI while passing locally. One `"@playwright/test@npm:..."` stanza in `yarn.lock`
  is the healthy state, two is the defect
- `package.json` and `yarn.lock` are committed together. Changing a range without the
  lockfile leaves the old version pinned for CI

## Update the tests snapshots

> All commands are assumed to be executed from the root directory

If you are comparing snapshots to validate your tests, you may need to update
the reference snapshots stored in the repository. To do that, you need to:

1. Compile the extension:

```sh
jlpm install
jlpm build:prod
```

> Check the extension is installed in JupyterLab.

2. Install test dependencies (needed only once):

```sh
cd ./ui-tests
jlpm install
jlpm playwright install
cd ..
```

3. Execute the [Playwright](https://playwright.dev/docs/intro) command:

```sh
cd ./ui-tests
jlpm playwright test -u
```

> Some discrepancy may occurs between the snapshots generated on your computer and
> the one generated on the CI. To ease updating the snapshots on a PR, you can
> type `please update playwright snapshots` to trigger the update by a bot on the CI.
> Once the bot has computed new snapshots, it will commit them to the PR branch.

## Create tests

> All commands are assumed to be executed from the root directory

To create tests, the easiest way is to use the code generator tool of playwright:

1. Compile the extension:

```sh
jlpm install
jlpm build:prod
```

> Check the extension is installed in JupyterLab.

2. Install test dependencies (needed only once):

```sh
cd ./ui-tests
jlpm install
jlpm playwright install
cd ..
```

3. Start the server:

```sh
cd ./ui-tests
jlpm start
```

4. Execute the [Playwright code generator](https://playwright.dev/docs/codegen) in **another terminal**:

```sh
cd ./ui-tests
jlpm playwright codegen localhost:${JUPYTER_TEST_PORT:-8888}
```

## Debug tests

> All commands are assumed to be executed from the root directory

To debug tests, a good way is to use the inspector tool of playwright:

1. Compile the extension:

```sh
jlpm install
jlpm build:prod
```

> Check the extension is installed in JupyterLab.

2. Install test dependencies (needed only once):

```sh
cd ./ui-tests
jlpm install
jlpm playwright install
cd ..
```

3. Execute the Playwright tests in [debug mode](https://playwright.dev/docs/debug):

```sh
cd ./ui-tests
jlpm playwright test --debug
```

## Upgrade Playwright and the browsers

To update the web browser versions, you must update the package `@playwright/test`:

```sh
cd ./ui-tests
jlpm up "@playwright/test"
jlpm playwright install
```
