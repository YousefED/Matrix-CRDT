# Development / contributing

We use [Lerna](https://lerna.js.org/) to manage the monorepo with separate packages.

## Running

Node.js is required to run this project. To download Node.js, visit [nodejs.org](https://nodejs.org/en/).

To run the project, open the command line in the project's root directory and enter the following commands:

    # Install all required npm modules for lerna, and bootstrap lerna packages
    npm run install-lerna
    npm run bootstrap

    # Build all projects
    npm run build

    # Tests
    npm run test

## Watch changes

    npm run watch

## Updating packages

If you've pulled changes from git that add new or update existing dependencies, use `npm run bootstrap` instead of `npm install` to install updated dependencies!

## Adding packages

- Add the dependency to the relevant `package.json` file (packages/xxx/packages.json)
- run `npm run install-new-packages`
- Double check `package-lock.json` to make sure only the relevant packages have been affected
