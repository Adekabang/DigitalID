/**
 * Blockchain Auth Client for the Blockchain Identity System
 * Handles wallet connection, authentication, and identity verification
 */
class BlockchainAuth {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl || 'http://localhost:3000/api';
        this.provider = null;
        this.signer = null;
        this.userAddress = null;
        this.authToken = null;
        this.verificationLevel = 0;
        this.reputationScore = 0;

        // Check for saved token in localStorage
        this.loadAuthState();
    }

    /**
     * Loads authentication state from localStorage
     */
    loadAuthState() {
        try {
            const savedAuthState = localStorage.getItem('blockchainAuthState');
            if (savedAuthState) {
                const authState = JSON.parse(savedAuthState);
                this.authToken = authState.token;
                this.userAddress = authState.address;
            }
        } catch (error) {
            console.error('Error loading auth state:', error);
        }
    }

    /**
     * Saves authentication state to localStorage
     */
    saveAuthState() {
        if (this.authToken && this.userAddress) {
            const authState = {
                token: this.authToken,
                address: this.userAddress,
            };
            localStorage.setItem(
                'blockchainAuthState',
                JSON.stringify(authState),
            );
        }
    }

    /**
     * Clears authentication state from localStorage
     */
    clearAuthState() {
        localStorage.removeItem('blockchainAuthState');
        this.authToken = null;
        this.userAddress = null;
        this.verificationLevel = 0;
        this.reputationScore = 0;
    }

    /**
     * Connects to wallet (MetaMask)
     * @returns {Promise<string>} Connected address
     */
    async connectWallet() {
        try {
            // Check if MetaMask is installed
            if (!window.ethereum) {
                throw new Error(
                    'MetaMask not detected. Please install MetaMask to use this application.',
                );
            }

            // Initialize ethers provider
            this.provider = new ethers.providers.Web3Provider(window.ethereum);

            // Request account access
            const accounts = await this.provider.send(
                'eth_requestAccounts',
                [],
            );

            if (accounts.length === 0) {
                throw new Error(
                    'No accounts found. Please unlock your MetaMask.',
                );
            }

            this.userAddress = accounts[0];
            this.signer = this.provider.getSigner();

            return this.userAddress;
        } catch (error) {
            console.error('Wallet connection error:', error);
            throw error;
        }
    }

    /**
     * Checks if the wallet address has a registered identity
     * @returns {Promise<boolean>} True if the wallet has a registered identity
     */
    async checkRegistration() {
        try {
            if (!this.userAddress) {
                throw new Error('Wallet not connected');
            }

            // Check if wallet has an identity by fetching identity data
            const response = await fetch(
                `${this.apiBaseUrl}/identity/${this.userAddress}`
            );
            
            const result = await response.json();
            
            // If successful response and has identity data, wallet is registered
            return result.success && result.data;
        } catch (error) {
            console.error('Registration check error:', error);
            return false;
        }
    }

    /**
     * Authenticates user with blockchain identity system
     * @returns {Promise<object>} Authentication result
     */
    async authenticate() {
        try {
            if (!this.signer || !this.userAddress) {
                throw new Error(
                    'Wallet not connected. Please connect your wallet first.',
                );
            }

            // Check if wallet is registered
            const isRegistered = await this.checkRegistration();
            if (!isRegistered) {
                throw new Error(
                    'Wallet not registered. Please register an identity first.',
                );
            }

            // Generate timestamp
            const timestamp = Math.floor(Date.now() / 1000).toString();

            // Message to sign
            const message = `Authenticate to Identity System: ${timestamp}`;

            // Sign message
            const signature = await this.signer.signMessage(message);

            // Send authentication request
            const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    address: this.userAddress,
                    signature,
                    timestamp,
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Authentication failed');
            }

            // Store access token
            this.authToken = result.data.accessToken;
            this.saveAuthState();

            // Fetch user verification level and reputation
            await this.fetchUserInfo();

            return {
                address: this.userAddress,
                verificationLevel: this.verificationLevel,
                reputationScore: this.reputationScore,
            };
        } catch (error) {
            console.error('Authentication error:', error);
            throw error;
        }
    }

    /**
     * Fetches user verification level and reputation score
     * @returns {Promise<object>} User info
     */
    async fetchUserInfo() {
        try {
            if (!this.userAddress) {
                throw new Error('User not authenticated');
            }

            // Fetch verification level
            const verificationResponse = await fetch(
                `${this.apiBaseUrl}/identity/${this.userAddress}`,
            );

            const verificationResult = await verificationResponse.json();

            if (verificationResult.success) {
                this.verificationLevel =
                    verificationResult.data.verificationLevel;
            }

            // Fetch reputation score
            const reputationResponse = await fetch(
                `${this.apiBaseUrl}/reputation/${this.userAddress}`,
            );

            const reputationResult = await reputationResponse.json();

            if (reputationResult.success) {
                this.reputationScore = reputationResult.data;
            }

            return {
                verificationLevel: this.verificationLevel,
                reputationScore: this.reputationScore,
            };
        } catch (error) {
            console.error('Error fetching user info:', error);
            throw error;
        }
    }

    /**
     * Checks if user is authenticated
     * @returns {boolean} True if authenticated
     */
    isAuthenticated() {
        return !!this.authToken && !!this.userAddress;
    }

    /**
     * Gets authorization headers for API requests
     * @returns {object} Headers object
     */
    getAuthHeaders() {
        if (!this.authToken) {
            return {};
        }

        return {
            Authorization: `Bearer ${this.authToken}`,
        };
    }

    /**
     * Signs out user
     */
    signOut() {
        this.clearAuthState();
    }
}
