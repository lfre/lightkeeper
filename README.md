<div align="center">

![](https://raw.githubusercontent.com/wiki/lfre/lightkeeper/images/lightkeeper-header-250.png)

# ⚓ _Lightkeeper_ (alpha)

![](https://badgen.net/github/status/lfre/lightkeeper/master)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://raw.githubusercontent.com/lfre/lightkeeper/master/LICENSE)
[![Donate](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.me/alfredolo/5)

Run [Lighthouse](https://developers.google.com/web/tools/lighthouse/) tests in Pull Request URLs with multiple routes. Prevent regressions through custom budgets in a flexible and extensible configuration.

[![](https://img.shields.io/static/v1.svg?label=INSTALL&message=GITHUB&color=brightgreen&link=https://github.com/apps/lightkeeper-ci&style=for-the-badge)](https://github.com/apps/lightkeeper-ci)

---
## It works with:

_Any Github Check Run, Deployment or Status, including:_

![](https://raw.githubusercontent.com/wiki/lfre/lightkeeper/images/logos/supported-ci.jpg)

</div>

## The Problem

There is a disconnect between the state of performance tooling, and the desire teams have to move faster but safer.

On one side, there are several tools to monitor production/staging environments, but on the other side, teams are looking to have full CI/CD integrated where Pull Requests go live upon merge.

This requires that all testing must happen at the Pull Request level on a unique URL per branch and/or commit, and while there are tools that support these types of Performance tests, they all suffer from common problems:

* **Single URL.**
    * A site is not a single URL. For several sites the most important page is a dynamic route **not** the homepage.
  
* **Run and block the CI build process.**
    * When all tests run on every Pull Request, their intention is to block merging if any issues are found, but during the different stages of development, the single most important task is to get an URL preview. Failing a build on another stage might require a dive into the build dashboard or logs to distinguish errors. Sending a notification, or posting a comment at the end of a specific task can help with this, but it requires additional effort.
  
* **If used for multiple URLs manually, there is no consolidated report.**
    * Pull Request pages can be overwhelming at times. From Peer Reviews to comments added by other tools, posting a comment per URL is too noisy.

## This Solution 

Lightkeeper attempts to solve each one of these issues: 🤞

* **Multiple URL support.**
    * Configure 1 to many URL routes, from separate domains or extending a base URL.
  
* **Decoupled from the CI build process.**
    * It runs when the CI build finishes and is successful. For complex build set ups, the [Lightkeeper Bot](#lightkeeper-bot) is available to trigger an event. This allows the build to continue without stalling waiting for a response.
  
* **Consolidated reports, and expandable comments.**
    * It posts a consolidated report of all tests, and includes only relevant information in the comment.

Most importantly, Lightkeeper provides granular control of settings per route, from budgets to the Lighthouse endpoint and its options, including chrome flags in the puppeteer configuration. 

See [Motivation](https://github.com/lfre/lightkeeper/wiki/Motivation).

## Getting Started

Add a `lightkeeper.json` file in a `.github` folder. Start from the [default configuration](/configuration/lightkeeper.json).

 > This is the only file Lightkeeper has access in your code.

There are 3 required fields: `baseUrl`, `ci`, and `type`. Lightkeeper is a budgeting tool, so at least a single type of budget is needed to run sucessfully.

- Replace the `baseUrl` with a valid URL. Since Pull Request URLs are dynamic, macros are available:
  
  | Macro | Details |
  | ----  | ------  |
  | `{pr_number}` | The Pull Request Number. |
  | `{branch}` | The branch name. |
  | `{commit_hash}` | The full commit SHA. |
  | `{commit_hash:n}` | A trimmed SHA, where `n` is a digit. |
  | *`{target_url}` | The target url from the Github Response. |

  \* Available for statuses and deployments.

- Replace `ci` and `type` for your CI tool. Examples:

  <details>
    <summary>Circle CI</summary>

    ```json
    {
      "ci": "circleci",
      "type": "check"
    }
    ```
    > CircleCI uses statuses by default, but also provide a [Github Checks integration](https://github.com/apps/circleci-checks).

    If multiple checks are running (e.g: Integration Tests, Mobile Tests, etc)

    Use the full name of the specific workflow as it appears in Github, instead of `circleci`.
  </details>
  <details>
    <summary>Netlify</summary>

    ```json
    {
      "baseUrl": "{target_url}",
      "ci": "netlify",
      "type": "status"
    }
    ```
  </details>
  <details>
    <summary>Travis CI</summary>

    ```json
    {
      "ci": "travis-ci",
      "type": "check"
    }
    ```
  </details>
  <details>
    <summary>Zeit Now</summary>

    ```json
    {
      "baseUrl": "{target_url}",
      "ci": "now",
      "type": "deployment"
    }
    ```
  </details>

> If you're unsure about the name of your CI tool, it's the name displayed under `Developer` in the application page:
> https://github.com/apps/[app-name]

## Configuration

Visit the [wiki]() for a full list of configuration options.

Additionally, there is a [custom configuration](/configuration/lightkeeper(custom).json) example.

## Lightkeeper Bot 🤖

Do you have a complex build pipeline that performs several tasks internally?
Using the [Lightkeeper Bot](https://www.npmjs.com/package/lightkeeperbot) with the app installed, you can start the process manually without stalling the build:

- Install:
  
  `npm i --save-dev lightkeeperbot`

- In your CI tool, run:
  
  `npx lightkeeperbot <baseUrl> [--options]`
  > Lightkeeper Bot defaults to Travis CI environment variables.

See the [full docs](https://www.npmjs.com/package/lightkeeperbot).

---

## Tools

- [probot](https://probot.github.io/)
- [lighthouse](https://github.com/GoogleChrome/lighthouse)
- [chrome-aws-lambda](https://github.com/alixaxel/chrome-aws-lambda)
- [puppeteer](https://github.com/GoogleChrome/puppeteer)

## Inspiration

- [Lighthouse Bot](https://github.com/GoogleChromeLabs/lighthousebot)
- [Lighthouse GH Reporter](https://github.com/carlesnunez/lighthouse-gh-reporter)

## FAQ

- **Why isn't this part of the Lighthouse Bot?**
  - That was my original intention after reading their [FAQ](https://github.com/GoogleChromeLabs/lighthousebot#why-not-a-github-webhook), but after I realized the best format is a Github App along with other features, it was clear the changes would be too drastic. However, `Lightkeeper` is compatible with their Ligthouse server located at https://builder-dot-lighthouse-ci.appspot.com/ci, if you choose to continue using it.

- **Why isn't this a Github Action?**
  - I wanted it to be and still do. However, besides the fact that Github Actions are (at the time of writing) Private Beta; it can lead to visual noise when skipping a check. <br>![](https://pbs.twimg.com/media/D-9aZn2WwAUv6Em?format=jpg&name=small)<br>
  If in the future, Github could allow a subset level of notifications per event (e.g: check run starts vs check run complete), and possibly a filter on `status` (only run action when a check run completes and is succesful); I'd be more than happy to switch since it removes the need for a server, and allows for securely sharing secrets.
  
- **I'm getting a Lighthouse error in my reports.**
  - If your page fails in [Page Speed Insights](https://developers.google.com/speed/pagespeed/insights/), it will most likely fail in Lightkeeper too. Consider changing the Lighthouse `throttling` options, or device emulation.

## Related Projects

- [Performance Budgets (Docker)](https://github.com/boyney123/performance-budget)
- [Zeit Integrations Platform](https://zeit.co/blog/zeit-now-integrations-platform)

## Contributing

Please open an issue if you have any questions, feature requests or problems, an example configuration for reproduction is deeply appreciatted. 👍

## Donating

If you find this tool useful, and want me to spend more time on it. Consider **[Donating](https://www.paypal.me/alfredolo/5)**.

---

AGPL, Copyright (c) 2019 Alfredo Lopez


