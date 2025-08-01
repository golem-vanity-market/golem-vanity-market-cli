# Golem Vanity Address Generator CLI

Welcome! This high-performance command-line interface (CLI) tool empowers you to generate custom "vanity" cryptocurrency addresses using the decentralized power of the [Golem Network](https://www.golem.network/). By leveraging distributed computing, this tool can efficiently find Ethereum addresses that match your desired custom prefixes.

A key feature of this tool is its commitment to your security. It operates exclusively on your public key, meaning your private key never leaves your local machine. The CLI employs an additive key splitting technique for secure vanity address generation.

We are also committed to transparency and will be open-sourcing the code that runs on the provider network.

## Features

- **Distributed Computing**: Harnesses the Golem Network's decentralized infrastructure for both CPU and GPU-based address generation.
- **Vanity Address Generation**: Create Ethereum addresses with unique prefixes (e.g., an address starting with `0x1337...`).
- **Flexible Processing**: Choose between CPU and GPU workers to meet your performance needs.
- **Budget Management**: Take control of your spending with comprehensive GLM budget controls, including automatic top-ups and spending limits.
- **Observability**: Monitor performance and metrics with built-in OpenTelemetry integration.
- **Results Export**: Conveniently save your generated addresses to a JSON file for easy access and record-keeping.

## Getting Started

Before you begin, please ensure you have the following prerequisites installed and configured.

### 1. Node.js (Version 22 or higher)

You'll need Node.js to run this tool. We recommend using Node Version Manager (nvm) to manage your Node.js versions.

```bash
# Install and use Node.js version 22 (lts) with nvm (recommended)
nvm install 22
nvm use 22

# Alternatively, download and install Node.js directly from https://nodejs.org/
```

### 2. Yagna Requestor Setup

A running Yagna instance with GLM tokens is required. Please follow the official Golem documentation for a detailed guide.

**📖 [Yagna Installation for Requestors](https://docs.golem.network/docs/creators/tools/yagna/yagna-installation-for-requestors)**

#### Quick Yagna Setup Guide:

1.  **Install Yagna**:
    ```bash
    curl -sSf https://join.golem.network/as-requestor | bash
    ```
2.  **Start the Yagna daemon**:
    ```bash
    yagna service run
    ```
3.  **Create and fund your account**:

    ```bash
    # Create a new account
    yagna payment init --sender

    # Check your wallet address to send GLM tokens
    yagna payment status
    ```

4.  **Set up your application key**:

    ```bash
    # Create a key for the application
    yagna app-key create requestor-key

    # Set the key as an environment variable
    export YAGNA_APPKEY=your-generated-app-key
    ```

## Installation

Get the CLI tool up and running on your local machine.

```bash
# Clone the repository from GitHub
git clone https://github.com/golem-vanity-market/golem-vanity-market-cli.git

# Navigate into the project directory
cd golem-vanity-market-cli/

# Install the necessary dependencies
npm install

# Build the project
npm run build

# set up the env variable, use the template and fill the values
cp .env.template .env

# first time, create a local db,
# we use it for tracking performance of providers
npm run db:setup

# Run the tool locally to see available commands
npm run dev -- generate --help
```

## Generating Your Keys

To generate a vanity address, you first need a public and private key pair. The CLI will use your **public key** (generated as `my-key.public` in the steps below) to search for a matching address on the Golem Network. Your private key remains securely on your machine.

Use the following `openssl` commands to generate your keys. You can run these in the same directory where you've installed the CLI.

1.  **Generate your private key**: This command creates a new private key using the `secp256k1` elliptic curve, which is used by Ethereum.

    ```bash
    openssl ecparam -name secp256k1 -genkey -noout -out ec_private.pem
    ```

2.  **Extract the public key**: This command derives the public key from your private key and saves it in a format that the CLI can use. The resulting `my-key.public` file is what you will use in the usage examples below.

    ```bash
    openssl ec -in ec_private.pem -pubout -outform DER | tail -c 65 | xxd -p -c 65 > my-key.public
    ```

3.  **(Optional) Extract the private key in a readable format**:
    ```bash
    openssl ec -in ec_private.pem -outform DER | tail -c +8 | head -c 32 | xxd -p -c 32 > my-key.private
    ```

Your public key file (`my-key.public`) should contain a hex-encoded Ethereum public key, like this:
`0x04d4a96d675423cc05f60409c48b084a53d3fa0ac59957939f526505c43f975b77fabab74decd66d80396308db9cb4db13b0c273811d51a1773d6d9e2dbcac1d28`

## 🛠️ Usage

After generating your `my-key.public` file, you can copy and paste the following commands to start generating your vanity address.

### Basic Usage

To generate a vanity address with a specific prefix, run the following command:

```bash
npm run start -- generate \
  --public-key ./my-key.public \
  --processing-unit cpu \
  --vanity-address-prefix 0x1337 \
  --budget-limit 10
```

### Advanced Usage Examples

#### GPU-Accelerated Generation

For faster results, you can leverage GPU providers on the Golem Network.

```bash
npm run start -- generate \
  --public-key ./my-key.public \
  --vanity-address-prefix 0xbeef \
  --processing-unit gpu \
  --budget-limit 20 \
  --num-workers 3
```

#### Generate Multiple Addresses and Export the Results

Find multiple vanity addresses and save them to a JSON file.

```bash
npm run start -- generate \
  --public-key ./my-key.public \
  --processing-unit gpu \
  --vanity-address-prefix 0xcafe \
  --num-results 5 \
  --budget-limit 10 \
  --results-file vanity-addresses.json \
  --non-interactive
```

#### CPU-Only Generation with Custom Timing

Customize the generation process for CPU-only workers with specific timing parameters for getting offers.

```bash
npm run start -- generate \
  --public-key ./my-key.public \
  --vanity-address-prefix 0xdead \
  --processing-unit cpu \
  --single-pass-sec 30 \
  --min-offers 10 \
  --budget-limit 10 \
  --min-offers-timeout-sec 60
```

## Command Reference

### `generate`

This command generates vanity addresses based on your specified parameters.

#### Required Options:

- `--public-key <path>`: Path to the file containing your public key.
- `--vanity-address-prefix <prefix>`: The desired vanity prefix for your address (1-10 alphanumeric characters).

#### Optional Options:

- `--processing-unit <type>`: Specify whether to use 'cpu' or 'gpu' workers (default: `gpu`).
- `--num-results <count>`: The number of vanity addresses to generate (default: `1`).
- `--num-workers <count>`: The number of parallel workers to use (default: `1`).
- `--single-pass-sec <seconds>`: The duration for each generation pass (default: `20`).
- `--results-file <path>`: The file path to save the results in JSON format (optional).
- `--db <path>`: Database file path for storing session data (default: `./db.sqlite`).
- `--non-interactive`: Skip confirmation prompts for automated use.
- `--min-offers <count>`: The minimum number of provider offers to wait for before starting (default: `5`).
- `--min-offers-timeout-sec <seconds>`: The maximum time to wait for the minimum number of offers (default: `30`).

##### Budget Management:

- `--budget-initial <amount>`: The initial GLM amount for the payment allocation (default: `1`).
- `--budget-top-up <amount>`: The amount in GLM to add to the allocation when its balance runs low (default: `1`).
- `--budget-limit <amount>`: **(Required)** The total budget cap in GLM for the entire generation process. Work stops when this limit is reached.

## Cost Estimation

The cost of generating a vanity address in GLM tokens depends on several factors:

- **Prefix Difficulty**: Longer prefixes are exponentially more difficult and therefore more expensive to find.
- **Processing Unit**: GPUs are generally faster but may have a higher cost per hour than CPUs.
- **Number of Workers**: Using more workers can speed up the process but will increase the overall cost.
- **Provider Pricing**: The Golem Network is a marketplace, and provider prices can fluctuate.

The tool provides real-time cost estimates and difficulty calculations before you commit to starting the generation process.

## Development

### Testing

Ensure the reliability of the tool by running our comprehensive test suite.

```bash
# Run all tests
npm test

# Run tests in watch mode for active development
npm run test:watch
```

### Code Quality

Maintain a clean and consistent codebase.

```bash
# Run the linter to check for code quality issues
npm run lint

# Automatically fix formatting issues
npm run format:fix
```

### Build

Compile the TypeScript code to JavaScript.

```bash
# Code generation
npm run prebuild

# Build the project
npm run build

# Start the built version of the tool
npm start
```

### Database

````bash
### Database Commands

The CLI provides several npm scripts for managing the local database:

```bash
# Initialize the database (run this before first use)
npm run db:setup

# Reset the database (drops and recreates tables)
npm run db:clear
````

The default database file is `./db.sqlite`, but you can specify a custom path using the `--db <path>` option.

### Golem network

Scanning the Golem network for offers:

```bash
npm run list-cpu-offers

npm run list-gpu-offers
```

## ⚙️ Environment Variables

You can configure the tool using the following environment variables:

- `YAGNA_APPKEY`: Your Yagna application key.
- `OTEL_EXPORTER_OTLP_ENDPOINT`: The endpoint for OpenTelemetry data.
- `OTEL_LOG_LEVEL`: The logging level (e.g., `debug`, `info`, `warn`, `error`).
- `RESULT_CSV_FILE`: A custom file path for the CSV output.
- `MESSAGE_LOOP_SEC_INTERVAL`: The interval for status updates in seconds (default: `30`).
- `PROCESS_LOOP_SEC_INTERVAL`: The interval for the main process loop in seconds (default: `1`).

## Troubleshooting

### Common Issues

1.  **"Yagna daemon not running"**:

    - Ensure that Yagna is installed correctly and currently running. You can start it with `yagna service run`.
    - Double-check that your `YAGNA_APPKEY` environment variable is set correctly.

2.  **"Insufficient GLM balance"**:

    - Check your current GLM balance with `yagna payment status`. You may need to transfer more GLM to your requestor wallet.

3.  **"No providers available"**:

    - Try increasing the `--min-offers-timeout-sec` to allow more time for discovering providers on the network.
    - Consider switching the processing unit type (e.g., from `gpu` to `cpu`) as there may be more providers of a different type available.

4.  **Generation is taking too long**:
    - Try a shorter, less complex prefix for faster results.
    - Increase the `--num-workers` to parallelize the search across more providers.
    - If you are using CPUs, switching to `--processing-unit gpu` can significantly improve performance.

### Logs

Application logs are stored in the `logs/` directory for debugging purposes.

- `logs.jsonl`: Contains the main application logs.
- `metrics.jsonl`: Contains metrics data for performance analysis.

### Support

- For issues related to **the Golem Network**, please refer to the [Golem Documentation](https://docs.golem.network/).
- For issues with **this CLI tool**, please open an issue in the project's GitHub repository.

## 📄 License

This project is licensed under the GNU General Public License v3.0. Please see the [LICENSE](LICENSE) file for more details.

## Contributing

We welcome contributions from the community!

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix.
3.  Make your changes and ensure they are well-tested.
4.  Add tests for any new functionality.
5.  Make sure all tests pass successfully.
6.  Submit a pull request with a clear description of your changes.

## Acknowledgments

- This tool was proudly built by [Unoperate](https://github.com/Unoperate) on the [Golem Network](https://www.golem.network/).
- We utilize OpenTelemetry for enhanced observability.
- Ethereum address generation is powered by the robust `ethers.js` library.
