# KYC Integration Guide

This guide explains how to set up and test the KYC verification bridge in the Blockchain Identity Oracle.

## Getting Started

The oracle service can connect to various KYC providers to verify user identities. In development or testing environments, you can use the built-in mock provider.

## Configuration

### Environment Variables

Configure your KYC provider in the `.env` file:

```
# KYC Provider Settings
KYC_PROVIDER_TYPE=mock
KYC_PROVIDER_URL=https://api.kyc-provider.com
KYC_PROVIDER_API_KEY=your_api_key
KYC_CALLBACK_URL=http://localhost:3030/api/callbacks/kyc
```

Available provider types:
- `mock` - Mock provider for development/testing
- `onfido` - Onfido KYC provider
- `jumio` - Jumio KYC provider
- `civic` - Civic KYC provider

## Using the Mock Provider

The mock provider simulates KYC verification without external dependencies, making it ideal for development and testing.

### Success Rates

The mock provider simulates different verification levels with varying success rates:

| Level | Type | Default Success Rate |
|-------|------|----------------------|
| 1 | Basic | 95% |
| 2 | KYC | 80% |
| 3 | Enhanced | 70% |

You can configure these rates in `src/config/kyc-providers.js`.

### Testing Mock Verification

You can test the mock KYC service using the API:

```bash
curl -X POST http://localhost:3030/api/verifications/mock \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "verificationType": 1,
    "metadata": {
      "fullName": "John Doe",
      "dateOfBirth": "1990-01-01"
    }
  }'
```

## Integrating Real KYC Providers

### Onfido Integration

1. Sign up for an Onfido account
2. Get your API key from the dashboard
3. Set up a webhook with your callback URL
4. Configure the oracle service:

```
KYC_PROVIDER_TYPE=onfido
KYC_PROVIDER_URL=https://api.onfido.com/v3
KYC_PROVIDER_API_KEY=your_onfido_api_key
KYC_WEBHOOK_SECRET=your_webhook_signing_secret
```

### Jumio Integration

1. Sign up for a Jumio account
2. Get your API key and secret
3. Set up a callback URL in the Jumio dashboard
4. Configure the oracle service:

```
KYC_PROVIDER_TYPE=jumio
KYC_PROVIDER_URL=https://netverify.com/api/v4
KYC_PROVIDER_API_KEY=your_jumio_api_key
KYC_PROVIDER_API_SECRET=your_jumio_api_secret
```

### Civic Integration

1. Register for a Civic developer account
2. Create an application and get your App ID and API key
3. Configure the oracle service:

```
KYC_PROVIDER_TYPE=civic
KYC_PROVIDER_URL=https://api.civic.com/kyc
KYC_PROVIDER_API_KEY=your_civic_api_key
KYC_PROVIDER_APP_ID=your_civic_app_id
```

## Working with KYC Callbacks

When a KYC provider completes a verification, it will send a callback to your service. The oracle is configured to handle callbacks at:

```
http://your-oracle-host:3030/api/callbacks/kyc
```

For testing, you can use a service like ngrok to expose your local server:

```bash
ngrok http 3030
```

Then update your KYC provider's callback URL to the ngrok URL.

## Verification Flow

1. A verification request is initiated on-chain
2. The oracle service detects the verification event
3. The oracle sends the verification request to the KYC provider
4. The KYC provider processes the verification
5. The KYC provider sends a callback with the result
6. The oracle service submits the result back to the blockchain
7. The user's verification level is updated accordingly

## Troubleshooting

### Callback Issues

If you're not receiving callbacks:
- Check that your callback URL is correctly configured
- Verify that your server is accessible from the internet
- Check for any firewall issues
- Look for errors in the oracle service logs

### Verification Failures

If verifications are failing:
- Check that your API key is correct and active
- Verify that you're sending the correct verification type
- Ensure the metadata includes all required fields
- Check the KYC provider's dashboard for error messages