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
    const userNameDiv = document.getElementById('user-name');
    const userAddressDiv = document.getElementById('user-address');
    const userVerificationDiv = document.getElementById('user-verification');
    const chatMessagesDiv = document.getElementById('chat-messages');
    const messageTextarea = document.getElementById('message-text');
    const sendMessageBtn = document.getElementById('send-message');
    const reportModal = document.getElementById('report-modal');
    const reportedMessageSpan = document.getElementById('reported-message');
    const reportedUserSpan = document.getElementById('reported-user');
    const reportedWalletSpan = document.getElementById('reported-wallet');
    const reportReasonSelect = document.getElementById('report-reason');
    const reportDetailsTextarea = document.getElementById('report-details');
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

        // Update verification level in auth status
        verificationLevelSpan.textContent =
            verificationLabels[verificationLevel] || 'Unknown';

        // Update reputation score in auth status
        reputationScoreSpan.textContent = reputationScore;

        // Format wallet address
        const shortAddress = `${auth.userAddress.substring(
            0,
            6,
        )}...${auth.userAddress.substring(auth.userAddress.length - 4)}`;

        // Update user details
        userNameDiv.textContent = `Connected as: User-${auth.userAddress.substring(
            0,
            6,
        )}`;
        userAddressDiv.textContent = shortAddress;

        // Update verification info
        if (verificationLevel > 0) {
            userVerificationDiv.innerHTML = `<span style="color: #27ae60;">✓</span> ${verificationLabels[verificationLevel]}`;
            userVerificationDiv.classList.add('verified');
        } else {
            userVerificationDiv.textContent = 'Not Verified';
            userVerificationDiv.classList.remove('verified');
        }

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

            // Disable message input if user is banned
            messageTextarea.disabled = true;
            sendMessageBtn.disabled = true;
            messageTextarea.placeholder =
                'Your account has been restricted due to community reports. You cannot send messages.';
        }

        // Clear previous content
        reputationBadgeDiv.innerHTML = '';

        // Create badge with simplified content
        const badgeContent = document.createElement('div');
        badgeContent.innerHTML = `
            <div class="badge-title">${badgeText}</div>
            <div class="badge-score">Score: ${score}</div>
        `;

        reputationBadgeDiv.classList.add(badgeClass);
        reputationBadgeDiv.appendChild(badgeContent);
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
            console.log(data);

            // If this is for the current user, update the UI
            if (userAddress === auth.userAddress) {
                auth.reputationScore = newReputation;
                reputationScoreSpan.textContent = newReputation;
                updateReputationBadge(newReputation.score);

                // Show alert if user became banned
                if (newReputation < 50) {
                    alert(
                        'Your reputation has fallen below the required threshold. You can no longer send messages in this chat.',
                    );

                    // Disable message input
                    messageTextarea.disabled = true;
                    sendMessageBtn.disabled = true;
                    messageTextarea.placeholder =
                        'Your account has been restricted due to community reports. You cannot send messages.';
                }
            }

            // Update in messages list to show new reputation
            const messagesToUpdate = Array.from(
                chatMessagesDiv.querySelectorAll('.message'),
            ).filter((msg) => msg.dataset.senderAddress === userAddress);

            messagesToUpdate.forEach((msgEl) => {
                const badgeEl = msgEl.querySelector('.reputation-badge');
                if (badgeEl) {
                    badgeEl.textContent = newReputation.score;

                    // Update badge class
                    badgeEl.classList.remove('high', 'medium', 'low');
                    if (newReputation >= 80) badgeEl.classList.add('high');
                    else if (newReputation >= 50)
                        badgeEl.classList.add('medium');
                    else badgeEl.classList.add('low');
                }
            });
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
        const {
            id,
            text,
            sender,
            senderAddress,
            timestamp,
            verificationLevel,
            reputationScore,
        } = message;

        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = 'message';
        messageEl.classList.add(
            senderAddress === auth.userAddress
                ? 'user-message'
                : 'other-message',
        );
        messageEl.dataset.id = id;
        messageEl.dataset.senderAddress = senderAddress;

        // Add message header
        const header = document.createElement('div');
        header.className = 'message-header';

        // Create sender info with name and wallet
        const senderEl = document.createElement('div');
        senderEl.className = 'message-sender-info';

        const senderNameEl = document.createElement('span');
        senderNameEl.className = 'message-sender-name';
        senderNameEl.textContent = sender;

        const senderWalletEl = document.createElement('span');
        senderWalletEl.className = 'message-sender-wallet';
        senderWalletEl.style.fontSize = '0.7rem';
        senderWalletEl.style.color = '#666';
        senderWalletEl.style.marginLeft = '5px';

        // Format wallet address for display (0x1234...5678)
        const shortAddress = `${senderAddress.substring(
            0,
            6,
        )}...${senderAddress.substring(senderAddress.length - 4)}`;
        senderWalletEl.textContent = shortAddress;

        // Add verification badge if verified
        if (verificationLevel > 0) {
            const verifiedBadge = document.createElement('span');
            verifiedBadge.className = 'verified-badge';
            verifiedBadge.style.color = '#27ae60';
            verifiedBadge.style.marginLeft = '5px';
            verifiedBadge.title = `Verification Level: ${verificationLabels[verificationLevel]}`;
            verifiedBadge.innerHTML = '✓';
            senderWalletEl.appendChild(verifiedBadge);
        }

        // Add reputation badge
        const repBadge = document.createElement('span');
        repBadge.className = 'reputation-badge';

        // Style based on score
        if (reputationScore.score >= 80) repBadge.classList.add('high');
        else if (reputationScore.score >= 50) repBadge.classList.add('medium');
        else repBadge.classList.add('low');

        repBadge.style.fontSize = '0.7rem';
        repBadge.style.marginLeft = '10px';
        repBadge.style.padding = '2px 6px';
        repBadge.style.borderRadius = '10px';
        repBadge.title = `Reputation Score: ${reputationScore.score}`;
        console.log('badge: ', reputationScore);
        repBadge.textContent = reputationScore.score;

        senderWalletEl.appendChild(repBadge);

        senderEl.appendChild(senderNameEl);
        senderEl.appendChild(senderWalletEl);

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
        reportedWalletSpan.textContent = message.senderAddress;
        // Clear previous details
        reportDetailsTextarea.value = '';
        reportModal.classList.remove('hidden');
    }

    /**
     * Submit report
     */
    async function submitReport() {
        try {
            if (!reportedMessageData) return;

            const reason = reportReasonSelect.value;
            const details = reportDetailsTextarea.value.trim();

            // Map reason to action type from enum ActionType {
            //     WARNING,           // 0
            //     RESTRICTION,       // 1
            //     SEVERE_RESTRICTION,// 2
            //     BAN,               // 3
            //     UNBAN              // 4
            // }
            let actionType = 1; // Default to RESTRICTION (1)

            // Set action type based on reason
            switch (reason) {
                case 'harmful':
                    actionType = 2; // SEVERE_RESTRICTION for harmful content
                    break;
                case 'abuse':
                    actionType = 3; // BAN for abuse/harassment
                    break;
                case 'spam':
                case 'misinformation':
                case 'impersonation':
                    actionType = 1; // RESTRICTION for other violations
                    break;
                case 'other':
                default:
                    actionType = 0; // WARNING for other/unspecified reasons
            }

            // Format reason string with details and message evidence
            const formattedReason = `${reason.toUpperCase()}: ${details} 
            | Evidence: "${reportedMessageData.text}
            | sender: ${reportedMessageData.sender}              
            | address: ${reportedMessageData.senderAddress} 
            | reported by: ${auth.userAddress}"`;

            // Create moderation case with specified format
            const response = await fetch(`${auth.apiBaseUrl}/moderation/case`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...auth.getAuthHeaders(),
                },
                body: JSON.stringify({
                    address: reportedMessageData.senderAddress,
                    actionType: actionType,
                    reason: formattedReason,
                }),
            });

            const result = await response.json();

            if (result.success) {
                // Now update reputation
                const reputationResponse = await fetch(
                    `${auth.apiBaseUrl}/reputation/update`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...auth.getAuthHeaders(),
                        },
                        body: JSON.stringify({
                            address: reportedMessageData.senderAddress,
                            points: -10, // Deduct 10 points for harmful content
                        }),
                    },
                );

                const reputationResult = await reputationResponse.json();

                if (reputationResult.success) {
                    // Get updated reputation
                    const updatedReputation =
                        reputationResult.data.updatedReputation;

                    // Notify all clients about reputation update via the Socket.io server
                    socket.emit('reputation_update_request', {
                        userAddress: reportedMessageData.senderAddress,
                        newReputation: updatedReputation,
                    });

                    alert(
                        'Report submitted successfully and user reputation has been reduced.',
                    );
                } else {
                    alert(
                        'Report submitted but reputation could not be updated: ' +
                            (reputationResult.error || 'Unknown error'),
                    );
                }
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
