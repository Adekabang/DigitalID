/**
 * Blockchain Identity Authentication Client
 * 
 * This client library helps integrate "Sign in with Blockchain Identity" into web applications.
 * It handles wallet connections, signature requests, and OAuth flows.
 */
class BlockchainAuthClient {
  /**
   * Initialize the client with configuration
   * @param {Object} config - Configuration object
   * @param {string} config.apiEndpoint - Blockchain Identity API endpoint
   * @param {string} config.clientId - OAuth client ID
   * @param {string} config.redirectUri - OAuth redirect URI
   * @param {string} config.apiKey - API key for authentication
   */
  constructor(config) {
    this.apiEndpoint = config.apiEndpoint;
    this.clientId = config.clientId;
    this.redirectUri = config.redirectUri;
    this.apiKey = config.apiKey;
    this.onSuccess = config.onSuccess || function() {};
    this.onError = config.onError || function() {};
  }

  /**
   * Initialize the auth client
   */
  init() {
    // Add click listener to the login button
    const loginBtn = document.getElementById('blockchain-login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => this.startLogin());
    }

    // Check for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      // Remove code from URL to prevent bookmarking issues
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Exchange code for token
      this.exchangeCodeForToken(code);
    }
  }

  /**
   * Start the login process by connecting to the user's wallet
   */
  async startLogin() {
    try {
      // Show loading state if defined
      if (this.onStartLogin) {
        this.onStartLogin();
      }
      
      // Check if Web3 is available (MetaMask or similar)
      if (!window.ethereum) {
        throw new Error('Please install MetaMask or another Web3 wallet to continue');
      }

      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      const address = accounts[0];
      if (!address) {
        throw new Error('No account selected');
      }
      
      // Generate timestamp for message
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      // Create message to sign
      const message = `Login to ${this.clientId} with timestamp: ${timestamp}`;
      
      // Request signature
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address]
      });
      
      // Initiate OAuth flow
      await this.requestAuthorizationCode(address, signature, timestamp);
      
    } catch (error) {
      console.error('Login error:', error);
      if (this.onError) {
        this.onError(error.message || 'Error during login process');
      }
    }
  }

  /**
   * Request an authorization code from the OAuth server
   */
  async requestAuthorizationCode(address, signature, timestamp) {
    try {
      const response = await fetch(`${this.apiEndpoint}/gateway/sso/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          client_id: this.clientId,
          redirect_uri: this.redirectUri,
          response_type: 'code',
          scope: 'identity.read reputation.read',
          state: this.generateRandomState(),
          address,
          signature,
          timestamp
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Authorization failed');
      }
      
      // Redirect to the redirect URL
      window.location.href = data.data.redirect_url;
      
    } catch (error) {
      console.error('Authorization error:', error);
      if (this.onError) {
        this.onError(error.message || 'Error during authorization');
      }
    }
  }

  /**
   * Exchange the authorization code for a token
   * This is typically done server-side, but for demo purposes we're showing client-side
   */
  async exchangeCodeForToken(code) {
    try {
      // In a real implementation, this would be a request to your backend
      const response = await fetch('/callback?code=' + code);
      
      if (response.ok) {
        // If successful, fetch the user profile
        const userProfile = await this.fetchUserProfile();
        
        // Call success callback if provided
        if (this.onSuccess && userProfile) {
          this.onSuccess(userProfile);
        }
      } else {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to exchange code for token');
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      if (this.onError) {
        this.onError(error.message || 'Error during token exchange');
      }
    }
  }
  
  /**
   * Fetch the user profile after authentication
   */
  async fetchUserProfile() {
    try {
      const response = await fetch('/api/user/profile');
      
      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get user data');
      }
      
      return data.data;
    } catch (error) {
      console.error('Profile fetch error:', error);
      if (this.onError) {
        this.onError(error.message || 'Error fetching user profile');
      }
      return null;
    }
  }
  
  /**
   * Log the user out
   */
  async logout() {
    try {
      const response = await fetch('/api/logout', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Logout failed');
      }
      
      // Reload the page after logout
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
      if (this.onError) {
        this.onError(error.message || 'Error during logout');
      }
    }
  }

  /**
   * Generate a random state parameter for CSRF protection
   */
  generateRandomState() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
  
  /**
   * Format a verification level to a human-readable status
   */
  getVerificationStatus(level) {
    switch (level) {
      case 0:
        return { text: 'Unverified', class: 'badge-unverified' };
      case 1:
        return { text: 'Basic Verified', class: 'badge-verified' };
      case 2:
        return { text: 'KYC Verified', class: 'badge-kyc' };
      case 3:
        return { text: 'Fully Verified', class: 'badge-full' };
      default:
        return { text: 'Unknown', class: 'badge-unverified' };
    }
  }
  
  /**
   * Truncate an address or DID for display
   */
  truncateAddress(address) {
    if (!address) return '';
    return address.slice(0, 6) + '...' + address.slice(-4);
  }
}

// Usage example:
/*
const authClient = new BlockchainAuthClient({
  apiEndpoint: 'https://api.blockchain-identity.com',
  clientId: 'YOUR_CLIENT_ID',
  redirectUri: 'https://your-app.com/callback',
  apiKey: 'YOUR_API_KEY',
  onSuccess: (user) => {
    console.log('Authenticated user:', user);
    // Update UI to show user is logged in
  },
  onError: (error) => {
    console.error('Authentication error:', error);
    // Show error message to user
  }
});

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  authClient.init();
});
*/