# Lightkeeper Bot

[![version](https://img.shields.io/badge/version-1.0.3-green.svg)](https://semver.org)

The Lightkeeper Bot is an extension wrapper for [Lightkeeper](https://github.com/lfre/lightkeeper).

By default, it provides a _fire-and-forget_ mechanism to trigger a manual event in the application (if installed), without stalling the build.

This is helpful for custom build pipelines that perform many tasks, and creating the Pull Request URL is one of them. In that case, the app's default behavior of waiting until the overall build finishes would be unnecesary.

## Customization

The hostname can be modifed through the `LIGHTKEEPER_HOST` environment variable.
Additionally, a `LIGHTKEEPER_API_KEY` is sent as an `Authentication` header.

**NOTE:** Lightkeeper does not currently require an API key, but will be eventually enforced.

## Usage

```
lightkeeperbot <baseUrl> [--pr=123] [--repo=owner/name] [--config-path=config/lightkeeper.(js|json)]
```

| Option | Type | Description | Required | Default |
| --------- | ---- | ----------- | -------- | ------- |
| pr | `Number` | The Pull Request Number | ✅ | `TRAVIS_PULL_REQUEST` |
| repo | `String` | The repo's owner/name | ✅ | `TRAVIS_PULL_REQUEST_SLUG` |
| config-path | `String` | The configuration path | — | `.github/lightkeeper.json` |

## Configuration File

See Lightkeeper's [configuration](https://github.com/lfre/lightkeeper#configuration).

- Set the `baseUrl` property to `{base_url}`, and Ligthkeeper will use the `<baseUrl>` option.
- To prevent the app from possibly running twice, and/or posting an invalid config check:
  - Modify the `ci` property to `lightkeeperbot`.
- The configuration file can be either `json` or `js`.

### Javascript Configuration:

- The default export can be an object or (async)function.
- If a function, the `baseUrl` option is passed as a parameter.
- It needs to return a JSON-like object.

## Using a Private Lighthouse Instance:

- Use a `js` config file, read API keys from environment
- Pass a `headers` object in `settings.lighthouse`
