# Security Policy

DataLab is designed to process and transform data locally within Visual Studio
Code, without transmitting it to external services.

## Supported Versions

Security fixes are provided for the latest published version of DataLab.

Older versions are not guaranteed to receive security updates.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately using
[GitHub Private Vulnerability Reporting](https://github.com/Beata-Humeniuk/data-lab/security/advisories/new).

If private reporting is unavailable, open a GitHub issue without disclosing
sensitive details and request a private communication method.

When reporting a vulnerability, please include:

- A clear description of the issue.
- Steps to reproduce the vulnerability.
- The affected DataLab version.
- A minimal example using synthetic data, if applicable.

Do not include real user data, credentials, access tokens, personal
information, or other sensitive content in vulnerability reports.

Please avoid publicly disclosing vulnerability details before they have been
reviewed and addressed.

## Data Processing and Privacy

### Local Processing

DataLab processes input data and executes transformations locally within the
VS Code environment.

The extension:

- Does not transmit input data to external services.
- Does not collect or send telemetry.
- Does not make network requests.
- Does not require an external processing service.

### Webview Security

The DataLab webview operates under a restrictive Content Security Policy (CSP).

Its security configuration includes:

- Scripts and styles restricted to resources authorized by a nonce.
- `connect-src 'none'` to prevent network connections from the webview.
- No local resource roots exposed to the webview.

These restrictions help limit unauthorized resource access and network
communication.

### Data Storage

DataLab saves each lab as a file in the labs folder:

```text
<labs folder>/<name>.lab.json
```

The labs folder is the path set in `dataLab.labsFolder`; without it, the
`data` folder of the Spec Studio package (`<workspace name>-spec/data`) when
Spec Studio is installed and the package exists, or `data` in the open
workspace. Without an open folder and without an absolute path, labs are kept
in the extension's global storage. In an untrusted workspace, the workspace
cannot change `dataLab.labsFolder` or `dataLab.useSpecPackage`.

Stored information includes:

- Input definitions and their sample data.
- Transformation definitions and configuration.

This allows labs to be reopened with their previously saved inputs and
transformations.

**Important:** Sample data persists between sessions until the corresponding
lab is deleted. A lab file in the workspace can be committed and pushed along
with the project; keep confidential data out of it, or out of version control.

Deleting a lab removes its file.

DataLab writes nothing in the workspace other than lab files in the labs
folder.

### Logic Spec Integration

When using **Open as a flow design**, DataLab passes the lab's inputs,
including their data, to the Logic Spec extension.

Logic Spec stores the transferred information in its own extension storage.

Data transferred to Logic Spec is therefore managed separately from DataLab's
stored labs.

### Handling Sensitive Data

Although DataLab processes data locally, users should consider the persistence
of saved sample data when working with confidential information.

For sensitive datasets, prefer anonymized or synthetic examples and delete labs
when they are no longer needed.

## Security Resources

- [Report a Vulnerability](https://github.com/Beata-Humeniuk/data-lab/security/advisories/new)
- [Report a General Issue](https://github.com/Beata-Humeniuk/data-lab/issues)
