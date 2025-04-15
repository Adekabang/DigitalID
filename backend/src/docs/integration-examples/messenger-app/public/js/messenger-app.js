/**
 * Messenger App Client
 * Integrates with Blockchain Auth for secure chat with identity verification
 */
(function () {
    // Initialize Auth Client with API base URL
    const auth = new BlockchainAuth('http://localhost:3000/api');

    // API endpoints
    const SOCKET_URL = 'http://localhost:3050'; // WebSocket server for chat
    const API_URL = 'http://localhost:3050/api'; // Chat API

    // DOM Elements
    const loginSection = document.getElementById('login-section');
    const chatSection = document.getElementById('chat-section');
    const connectWalletBtn = document.getElementById('connect-wallet');
    const authStatusDiv = document.getElementById('auth-status');
    const authErrorDiv = document.getElementById('auth-error');
    const userAddressSpan = document.getElementById('user-address');
    const verificationLevelSpan = document.getElementById('verification-level');
    const reputationScoreSpan = document.getElementById('reputation-score');
    const reputationBadgeDiv = document.getElementById('reputation-badge');
    const chatMessagesDiv = document.getElementById('chat-messages');
    const messageTextarea = document.getElementById('message-text');
    const sendMessageBtn = document.getElementById('send-message');
    const reportModal = document.getElementById('report-modal');
    const reportedMessageSpan = document.getElementById('reported-message');
    const reportedUserSpan = document.getElementById('reported-user');
    const reportReasonSelect = document.getElementById('report-reason');
    const submitReportBtn = document.getElementById('submit-report');
    const cancelReportBtn = document.getElementById('cancel-report');

    let socket = null;
    let reportedMessageData = null;

    // Verification Level Labels
    const verificationLabels = {
        0: 'Not Verified',
        1: 'Basic Verification',
        2: 'KYC Verified',
        3: 'Fully Verified',
    };

    /**
     * Connect wallet and authenticate
     */
    async function connectAndAuthenticate() {
        try {
            authErrorDiv.classList.add('hidden');
            connectWalletBtn.disabled = true;
            connectWalletBtn.textContent = 'Connecting...';

            // Connect wallet
            const address = await auth.connectWallet();
            userAddressSpan.textContent = address;

            // Check if wallet is registered
            const isRegistered = await auth.checkRegistration();
            if (!isRegistered) {
                throw new Error(
                    'Your wallet does not have a registered identity. Please register an identity through the main application before using the messenger.',
                );
            }

            // Authenticate
            connectWalletBtn.textContent = 'Authenticating...';
            const userInfo = await auth.authenticate();

            // Update UI
            updateUserInfo(userInfo);
            authStatusDiv.classList.remove('hidden');
            connectWalletBtn.classList.add('hidden');

            // Switch to chat section
            loginSection.classList.add('hidden');
            chatSection.classList.remove('hidden');

            // Connect to chat
            connectChat();
        } catch (error) {
            console.error('Authentication error:', error);
            authErrorDiv.textContent = error.message;
            authErrorDiv.classList.remove('hidden');
            connectWalletBtn.textContent = 'Connect Wallet';
            connectWalletBtn.disabled = false;
        }
    }

    /**
     * Update user info in the UI
     */
    function updateUserInfo(userInfo) {
        const { verificationLevel, reputationScore } = userInfo;

        // Update verification level
        verificationLevelSpan.textContent =
            verificationLabels[verificationLevel] || 'Unknown';

        // Update reputation score
        reputationScoreSpan.textContent = reputationScore;

        // Update reputation badge
        updateReputationBadge(reputationScore.score);
    }

    /**
     * Update reputation badge based on score
     */
    function updateReputationBadge(score) {
        console.log(score);
        // Remove all classes
        reputationBadgeDiv.classList.remove(
            'score-high',
            'score-medium',
            'score-low',
        );

        // Add class based on score
        let badgeClass, badgeText;

        if (score >= 80) {
            badgeClass = 'score-high';
            badgeText = 'Trusted User';
        } else if (score >= 50) {
            badgeClass = 'score-medium';
            badgeText = 'Regular User';
        } else {
            badgeClass = 'score-low';
            badgeText = 'Banned User';
        }

        reputationBadgeDiv.classList.add(badgeClass);
        reputationBadgeDiv.textContent = `${badgeText} (${score})`;
    }

    /**
     * Connect to chat WebSocket
     */
    function connectChat() {
        // Initialize Socket.io connection
        socket = io(SOCKET_URL, {
            auth: {
                token: auth.authToken,
            },
        });

        // Socket event listeners
        socket.on('connect', () => {
            console.log('Connected to chat');
            loadChatHistory();
        });

        socket.on('message', (message) => {
            addMessageToChat(message);
        });

        socket.on('reputation_update', (data) => {
            const { userAddress, newReputation } = data;

            // If this is for the current user, update the UI
            if (userAddress === auth.userAddress) {
                auth.reputationScore = newReputation;
                reputationScoreSpan.textContent = newReputation;
                updateReputationBadge(newReputation.score);
            }
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from chat');
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
        });
    }

    /**
     * Load chat history
     */
    async function loadChatHistory() {
        try {
            const response = await fetch(`${API_URL}/messages`, {
                headers: {
                    ...auth.getAuthHeaders(),
                },
            });

            const result = await response.json();

            if (result.success) {
                chatMessagesDiv.innerHTML = '';
                result.data.forEach((message) => {
                    addMessageToChat(message);
                });
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    /**
     * Send message
     */
    async function sendMessage() {
        const messageText = messageTextarea.value.trim();

        if (!messageText) return;

        try {
            socket.emit('send_message', {
                text: messageText,
            });

            // Clear the textarea
            messageTextarea.value = '';
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    /**
     * Add message to chat UI
     */
    function addMessageToChat(message) {
        const { id, text, sender, senderAddress, timestamp } = message;

        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = 'message';
        messageEl.classList.add(
            senderAddress === auth.userAddress
                ? 'user-message'
                : 'other-message',
        );
        messageEl.dataset.id = id;

        // Add message header
        const header = document.createElement('div');
        header.className = 'message-header';

        const senderEl = document.createElement('span');
        senderEl.className = 'message-sender';
        senderEl.textContent = sender;

        const timeEl = document.createElement('span');
        timeEl.className = 'message-time';
        timeEl.textContent = new Date(timestamp).toLocaleTimeString();

        header.appendChild(senderEl);
        header.appendChild(timeEl);

        // Add message content
        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = text;

        // Add report button (only for other users' messages)
        if (senderAddress !== auth.userAddress) {
            const actions = document.createElement('div');
            actions.className = 'message-actions';

            const reportBtn = document.createElement('button');
            reportBtn.className = 'report-btn';
            reportBtn.textContent = 'Report';
            reportBtn.addEventListener('click', () => showReportModal(message));

            actions.appendChild(reportBtn);
            messageEl.appendChild(actions);
        }

        // Assemble message
        messageEl.appendChild(header);
        messageEl.appendChild(content);

        // Add to chat
        chatMessagesDiv.appendChild(messageEl);

        // Scroll to bottom
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    }

    /**
     * Show report modal
     */
    function showReportModal(message) {
        reportedMessageData = message;
        reportedMessageSpan.textContent = message.text;
        reportedUserSpan.textContent = message.sender;
        reportModal.classList.remove('hidden');
    }

    /**
     * Submit report
     */
    async function submitReport() {
        try {
            if (!reportedMessageData) return;

            const reason = reportReasonSelect.value;

            // Send report to API
            const response = await fetch(`${API_URL}/report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...auth.getAuthHeaders(),
                },
                body: JSON.stringify({
                    messageId: reportedMessageData.id,
                    reason,
                    userAddress: reportedMessageData.senderAddress,
                }),
            });

            const result = await response.json();

            if (result.success) {
                alert('Report submitted successfully');
            } else {
                throw new Error(result.error || 'Failed to submit report');
            }

            // Close modal
            closeReportModal();
        } catch (error) {
            console.error('Error submitting report:', error);
            alert(`Error: ${error.message}`);
        }
    }

    /**
     * Close report modal
     */
    function closeReportModal() {
        reportModal.classList.add('hidden');
        reportedMessageData = null;
    }

    // Event Listeners

    // Connect wallet button
    connectWalletBtn.addEventListener('click', connectAndAuthenticate);

    // Send message button
    sendMessageBtn.addEventListener('click', sendMessage);

    // Enter key to send message
    messageTextarea.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Report modal buttons
    submitReportBtn.addEventListener('click', submitReport);
    cancelReportBtn.addEventListener('click', closeReportModal);

    // Check if already authenticated
    if (auth.isAuthenticated()) {
        // Refresh user info and reconnect
        auth.fetchUserInfo()
            .then((userInfo) => {
                updateUserInfo(userInfo);
                authStatusDiv.classList.remove('hidden');
                connectWalletBtn.classList.add('hidden');

                // Switch to chat section
                loginSection.classList.add('hidden');
                chatSection.classList.remove('hidden');

                // Connect to chat
                connectChat();
            })
            .catch((error) => {
                console.error('Error refreshing user info:', error);
                // Force reconnect
                auth.clearAuthState();
            });
    }
})();
