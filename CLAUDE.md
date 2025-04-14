# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Test Commands
- Test contracts: `npx hardhat test`
- Run specific test: `npx hardhat test test/system-test.js`
- Start backend server: `cd backend && npm run dev`
- Deploy contracts locally: `npx hardhat run scripts/deploy.js --network localhost`

## Code Style Guidelines
- Formatting: 80 char width, 4 spaces, single quotes, trailing commas
- Naming: camelCase for variables/functions, PascalCase for classes/contracts
- Imports: CommonJS style, group by type (services, utils, external deps)
- Error handling: Use custom error classes, try/catch with next(error) in controllers
- Logging: Use winston logger with appropriate levels (info/error)
- API responses: Consistent format `{success: true/false, data: {}, error: {}}`
- Validation: Always validate Ethereum addresses with ethers.isAddress()
- Controllers: Class-based with method binding in constructor
- Security: Validate all inputs, use middleware for auth and rate limiting