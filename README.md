# Golem Vanity Address Generator CLI

Welcome! This high-performance command-line interface (CLI) tool empowers you to generate custom "vanity" cryptocurrency addresses using the decentralized power of the [Golem Network](https://www.golem.network/). By leveraging distributed computing, this tool can efficiently find Ethereum addresses that match your desired custom prefixes.

A key feature of this tool is its commitment to your security. It operates exclusively on your public key, meaning your private key never leaves your local machine. The CLI employs an additive key splitting technique for secure vanity address generation.

We are also committed to transparency and will be open-sourcing the code that runs on the provider network.

## Features

- **Distributed Computing**: Harnesses the Golem Network's decentralized infrastructure for both CPU and GPU-based address generation.
- **Advanced Pattern Matching**: Generate Ethereum addresses with multiple pattern types:
  - **Prefixes**: Addresses starting with custom patterns (e.g., `0x1337...`)
  - **Suffixes**: Addresses ending with specific patterns (e.g., `...beef`)
  - **Mask Patterns**: Complex patterns with wildcards (e.g., `0xaabbXXXXXXXXXXXXccdd`)
  - **Repeating Characters**: Leading/trailing identical characters (e.g., `0xaaaaaaa...`)
  - **Character Distribution**: Letters-heavy, numbers-only, or snake patterns
- **Flexible Processing**: Choose between CPU and GPU workers to meet your performance needs.
- **Budget Management**: Take control of your spending with comprehensive GLM budget controls, including automatic top-ups and spending limits.
- **Observability**: Monitor performance and metrics with built-in OpenTelemetry integration and Prometheus metrics endpoint.
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

Your public key file (`my-key.public`) should contain a hex-encoded secp256k1 public key (65 bytes, starting with 0x04), like this:
`0x04d4a96d675423cc05f60409c48b084a53d3fa0ac59957939f526505c43f975b77fabab74decd66d80396308db9cb4db13b0c273811d51a1773d6d9e2dbcac1d28`

## 🛠️ Usage

After generating your `my-key.public` file, you can copy and paste the following commands to start generating your vanity address.

### Basic Usage

To generate a vanity address with a specific prefix, run the following command:

**Linux/macOS:**

```bash
npm run start -- generate \
  --public-key ./my-key.public \
  --processing-unit cpu \
  --vanity-address-prefix 0x1337 \
  --budget-limit 10
```

#### Generate an Address with a Custom Suffix

You can also generate addresses that end with a specific pattern:

**Linux/macOS:**

```bash
npm run start -- generate \
  --public-key ./my-key.public \
  --processing-unit cpu \
  --vanity-address-suffix beef \
  --budget-limit 10
```

**Windows:**

```bash
npm run start -- generate --public-key ./my-key.public --processing-unit cpu --vanity-address-suffix beef --budget-limit 10
```

**Windows:**

```bash
npm run start -- generate --public-key ./my-key.public --processing-unit cpu --vanity-address-prefix 0x1337 --budget-limit 10
```

#### Using the Development Version

During development or testing, you can use the development version:

```bash
npm run dev -- generate \
  --public-key ./my-key.public \
  --processing-unit cpu \
  --vanity-address-prefix 0x1337 \
  --budget-limit 10
```

### Advanced Pattern Examples

#### Mask Pattern Generation

Generate addresses matching complex patterns with wildcards (use 'x' for any character):

**Linux/macOS:**

```bash
npm run start -- generate \
  --public-key ./my-key.public \
  --vanity-address-mask 0x1234xxxxxxxxxxxxxxxxxxxxxxxxxxxx5678 \
  --processing-unit gpu \
  --budget-limit 15
```

**Windows:**

```bash
npm run start -- generate --public-key ./my-key.public --vanity-address-mask 0x1234xxxxxxxxxxxxxxxxxxxxxxxxxxxx5678 --processing-unit gpu --budget-limit 15
```

#### Multiple Pattern Search

Search for addresses matching any of several patterns simultaneously:

**Linux/macOS:**

```bash
npm run start -- generate \
  --public-key ./my-key.public \
  --vanity-address-prefix 0xdead \
  --vanity-address-suffix beef \
  --vanity-address-leading 6 \
  --processing-unit gpu \
  --budget-limit 25 \
  --num-workers 2
```

**Windows:**

```bash
npm run start -- generate --public-key ./my-key.public --vanity-address-prefix 0xdead --vanity-address-suffix beef --vanity-address-leading 6 --processing-unit gpu --budget-limit 25 --num-workers 2
```

#### GPU-Accelerated Generation

For faster results, you can leverage GPU providers on the Golem Network.

**Linux/macOS:**

```bash
npm run start -- generate \
  --public-key ./my-key.public \
  --vanity-address-prefix 0xbeef \
  --processing-unit gpu \
  --budget-limit 20 \
  --num-workers 3
```

**Windows:**

```bash
npm run start -- generate --public-key ./my-key.public --vanity-address-prefix 0xbeef --processing-unit gpu --budget-limit 20 --num-workers 3
```

#### Advanced Character Patterns

Generate addresses with specific character distributions:

**Linux/macOS:**

```bash
# Letters-heavy addresses (containing many a-f characters)
npm run start -- generate \
  --public-key ./my-key.public \
  --vanity-address-letters-heavy 35 \
  --processing-unit cpu \
  --budget-limit 12

# Numbers-only addresses (0-9 characters only)
npm run start -- generate \
  --public-key ./my-key.public \
  --vanity-address-numbers-only \
  --processing-unit gpu \
  --budget-limit 8

# Snake pattern (repeating character pairs)
npm run start -- generate \
  --public-key ./my-key.public \
  --vanity-address-snake 15 \
  --processing-unit gpu \
  --budget-limit 18
```

#### Generate Multiple Addresses and Export the Results

Find multiple vanity addresses and save them to a JSON file.

**Linux/macOS:**

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

**Windows:**

```bash
npm run start -- generate --public-key ./my-key.public --processing-unit gpu --vanity-address-prefix 0xcafe --num-results 5 --budget-limit 10 --results-file vanity-addresses.json --non-interactive
```

#### CPU-Only Generation with Custom Timing

Customize the generation process for CPU-only workers with specific timing parameters for getting offers.

**Linux/macOS:**

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

**Windows:**

```bash
npm run start -- generate --public-key ./my-key.public --vanity-address-prefix 0xdead --processing-unit cpu --single-pass-sec 30 --min-offers 10 --budget-limit 10 --min-offers-timeout-sec 60
```

## Command Reference

### `generate`

This command generates vanity addresses based on your specified parameters.

#### Required Options:

- `--public-key <path>`: Path to the file containing your public key.
- `--budget-limit <amount>`: The total budget cap in GLM for the entire generation process.

#### Pattern Options (at least one required):

- `--vanity-address-prefix <prefix>`: Search for addresses starting with the specified prefix (1-16 hex characters).
- `--vanity-address-suffix <suffix>`: Search for addresses ending with the specified suffix (1-16 hex characters).
- `--vanity-address-mask <mask>`: Search for addresses matching a pattern with wildcards (use 'x' for any character).
- `--vanity-address-leading <length>`: Find addresses with at least N identical leading characters.
- `--vanity-address-trailing <length>`: Find addresses with at least N identical trailing characters.
- `--vanity-address-letters-heavy <count>`: Generate addresses containing at least N letters (a-f).
- `--vanity-address-numbers-only`: Search for addresses composed only of numbers (0-9).
- `--vanity-address-snake <count>`: Find addresses with at least N pairs of adjacent identical characters.

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

## Cost Estimation

The cost of generating a vanity address in GLM tokens depends on several factors:

- **Pattern Complexity**: Different patterns have varying difficulty levels:
  - **Prefix/Suffix**: Exponentially more difficult with length (16^N)
  - **Mask Patterns**: Difficulty based on non-wildcard characters
  - **Character Distribution**: Letters-heavy and numbers-only patterns have statistical difficulty
  - **Snake Patterns**: Complexity increases with required adjacent pairs
- **Processing Unit**: GPUs are generally faster but may have a higher cost per hour than CPUs.
- **Number of Workers**: Using more workers can speed up the process but will increase the overall cost.
- **Multiple Patterns**: Searching for multiple patterns simultaneously can improve efficiency.
- **Provider Pricing**: The Golem Network is a marketplace, and provider prices can fluctuate.

The tool provides real-time cost estimates and difficulty calculations for each pattern type before you commit to starting the generation process.

### Pattern Generation Difficulty

For detailed information about vanity address generation difficulty, time estimates, and hardware performance comparisons across different pattern lengths, see [PATTERN_GEN_DIFF.md](PATTERN_GEN_DIFF.md).

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

| Variable                            | Description                                             | Default Value                 |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------- |
| `YAGNA_APPKEY`                      | Your Yagna application key (required)                   | (required)                    |
| `STATUS_SERVER`                     | HTTP server address for real-time monitoring (optional) | (disabled if not set)         |
| `OTEL_CONFIG_FILE`                  | Path to OpenTelemetry configuration file                | `monitoring/otel-config.yaml` |
| `OTEL_LOG_LEVEL`                    | Logging level (`debug`, `info`, `warn`, `error`)        | `info`                        |
| `MAX_CPU_ENV_PER_HOUR`              | Maximum price per hour for CPU environment (GLM)        | `0.1`                         |
| `MAX_CPU_CPU_PER_HOUR`              | Maximum price per hour for CPU compute (GLM)            | `0.1`                         |
| `MAX_GPU_ENV_PER_HOUR`              | Maximum price per hour for GPU environment (GLM)        | `2.0`                         |
| `RESULT_CSV_FILE`                   | Custom file path for CSV output                         | `results-{current-date}.csv`  |
| `MESSAGE_LOOP_SEC_INTERVAL`         | Interval for status updates in seconds                  | `30`                          |
| `PROCESS_LOOP_SEC_INTERVAL`         | Interval for the main process loop in seconds           | `1`                           |
| `COMMAND_EXECUTION_TIMEOUT_BUFFER`  | Extra time (ms) before aborting unresponsive commands   | `30000` (30s)                 |
| `RENTAL_RELEASE_TIMEOUT`            | Timeout (ms) for releasing a rental                     | `30000` (30s)                 |
| `RENTAL_DESTROY_TIMEOUT`            | Timeout (ms) for destroying a rental                    | `30000` (30s)                 |
| `MAX_CONSECUTIVE_ALLOCATION_ERRORS` | Maximum consecutive allocation errors before giving up  | `10`                          |

## Status Monitoring (Enhanced in v0.1.10)

The CLI now includes an optional HTTP status server for real-time monitoring of your vanity address generation progress. This feature is particularly useful for long-running jobs or when integrating with external monitoring systems.

### Enabling the Status Server

Set the `STATUS_SERVER` environment variable before running your generation command:

```bash
# Enable status server on localhost port 8080
export STATUS_SERVER=http://localhost:8080

npm run start -- generate \
  --public-key ./my-key.public \
  --vanity-address-prefix 0x1337 \
  --budget-limit 10
```

### Available Endpoints

Once enabled, you can monitor your generation progress through these HTTP endpoints:

- `GET /status` - Current generation status and statistics
- `GET /estimator` - Performance estimation data
- `GET /golem-session` - Golem network connection status
- `GET /reputation` - Provider reputation information

**Example: Check current status**

```bash
# View current generation progress
curl http://localhost:8080/status

# Check performance estimates
curl http://localhost:8080/estimator
```

This monitoring feature provides real-time insights into:

- Generation progress and found addresses across all pattern types
- Provider performance and costs for different processing units
- Network connectivity status and available offers
- Time and difficulty estimates for complex pattern combinations
- Multi-pattern search progress and efficiency metrics

## Prometheus Metrics Integration

The CLI automatically exposes performance metrics in Prometheus format via an embedded HTTP server on port 9464. This allows you to integrate with monitoring systems like Grafana for advanced analytics and alerting.

### Accessing Prometheus Metrics

The metrics endpoint is automatically available when the CLI is running:

```bash
# View all available metrics in Prometheus format
curl http://localhost:9464/metrics

# Example metrics include:
# - vanity_generation_attempts_total
# - vanity_addresses_found_total
# - provider_performance_stats
# - budget_utilization_metrics
# - pattern_difficulty_estimates
```

### Integration with Monitoring Systems

You can configure Prometheus to scrape these metrics by adding the following to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: "golem-vanity-cli"
    static_configs:
      - targets: ["localhost:9464"]
    scrape_interval: 15s
```

This enables comprehensive monitoring dashboards and alerting for your vanity address generation process.

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
    - Try simpler patterns (shorter prefixes/suffixes, fewer required characters).
    - Use multiple pattern types simultaneously to increase hit probability.
    - Consider mask patterns with more wildcards ('x') for easier matching.
    - Increase the `--num-workers` to parallelize the search across more providers.
    - If you are using CPUs, switching to `--processing-unit gpu` can significantly improve performance.

### Logs

Application logs are stored in the `logs/` directory for debugging purposes.

- `logs.jsonl`: Contains the main application logs with OpenTelemetry trace correlation.

**Note**: Performance metrics are no longer written to `metrics.jsonl` files. Instead, they are available in real-time via the Prometheus endpoint at `http://localhost:9464/metrics`.

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
