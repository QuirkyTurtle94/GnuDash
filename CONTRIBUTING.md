# Contributing to GnuDash

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

1. **Open an issue first** — Before writing any code, [open an issue](https://github.com/QuirkyTurtle94/GnuDash/issues) to discuss what you'd like to change. This helps avoid duplicate work and ensures the change aligns with the project direction.
2. **Fork the repo** and create a branch from `main`.
3. **Make your changes** — See [Development Setup](#development-setup) below.
4. **Submit a pull request** — Reference the issue number in your PR description.

## Development Setup

```bash
# Fork and clone
git clone https://github.com/<your-username>/GnuDash.git
cd GnuDash/app

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000). You can use Demo Mode to work without a real GNUCash file.

## Guidelines

- **Keep PRs focused** — One feature or fix per pull request.
- **Test with a GNUCash file** — If your change affects data parsing or display, verify it works with a real `.gnucash` SQLite file as well as Demo Mode.
- **Follow existing patterns** — Match the code style and project structure already in place.
- **No breaking changes to file handling** — GnuDash is read-only and must never modify uploaded `.gnucash` files.

## Reporting Bugs

[Open an issue](https://github.com/QuirkyTurtle94/GnuDash/issues) with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Browser and OS (if relevant)

## Suggesting Features

[Open an issue](https://github.com/QuirkyTurtle94/GnuDash/issues) describing the feature and why it would be useful. Please check existing issues first to avoid duplicates.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
