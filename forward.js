#!/usr/bin/env node
// forward.js  — Wrapper for executing commands with npx (additionally loads environment variables from .env file)

const { exec } = require("node:child_process");
require("dotenv").config();

const args = process.argv.slice(2);

const command = `npx ${args.join(" ")}`;

console.log(`Running ${command}`);
exec(command, { stdio: "inherit" }, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error executing command: ${error.message}`);
    process.exit(1);
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
  }
  console.log(`stdout: ${stdout}`);
  process.exit(0);
});
