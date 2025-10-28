// Chat functionality
function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (message) {
        addUserMessage(message);
        input.value = '';
        
        // Simulate agent response
        setTimeout(() => {
            addAgentMessage(getAgentResponse(message));
        }, 1000 + Math.random() * 2000);
    }
}

function sendQuickReply(message) {
    addUserMessage(message);
    
    // Remove quick replies after use
    const quickReplies = document.querySelector('.quick-replies');
    if (quickReplies) {
        quickReplies.style.display = 'none';
    }
    
    // Simulate agent response
    setTimeout(() => {
        addAgentMessage(getAgentResponse(message));
    }, 1000 + Math.random() * 2000);
}

function addUserMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';
    messageDiv.innerHTML = `
        <div class="message-content" style="background: rgba(17, 17, 17, 0.8); border: 1px solid #ffd23f; padding: 1rem; border-radius: 15px 15px 5px 15px; max-width: 80%; margin-left: auto; text-align: right;">
            <p style="margin: 0; color: #ffd23f;">${message}</p>
            <span class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addAgentMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message agent-message';
    messageDiv.innerHTML = `
        <div class="message-content">
            <p style="margin: 0; color: #ffd23f;">${message}</p>
            <span class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getAgentResponse(userMessage) {
    const responses = {
        'I want to rent a car': 'Great! I can help you find the perfect vehicle. What type of car are you looking for and when do you need it?',
        'Check my booking': 'I\'d be happy to help you check your booking. Could you please provide your booking reference number?',
        'Pricing information': 'Our pricing varies by vehicle type and rental duration. Our luxury cars start from $150/day. Would you like specific pricing for any particular vehicle?',
        'Vehicle specifications': 'We have detailed specs for all our vehicles. Which car are you interested in? We have Mercedes, BMW, Audi, Lamborghini and more!'
    };
    
    // Check for exact matches first
    if (responses[userMessage]) {
        return responses[userMessage];
    }
    
    // Check for keywords
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('price') || lowerMessage.includes('cost')) {
        return 'Our pricing is competitive and varies by vehicle class. Luxury cars start at $150/day, sports cars at $300/day. Would you like a detailed quote?';
    } else if (lowerMessage.includes('book') || lowerMessage.includes('reserve')) {
        return 'I can help you make a booking! To get started, I\'ll need your preferred dates, location, and vehicle type. What are you looking for?';
    } else if (lowerMessage.includes('mercedes') || lowerMessage.includes('bmw') || lowerMessage.includes('audi')) {
        return 'Excellent choice! We have several models from that brand. Would you like me to show you our current availability and pricing?';
    } else if (lowerMessage.includes('cancel')) {
        return 'I can help you with cancellations. Please provide your booking reference, and I\'ll check the cancellation policy for your reservation.';
    } else if (lowerMessage.includes('insurance')) {
        return 'All our rentals include comprehensive insurance. We also offer additional coverage options. Would you like details about our insurance packages?';
    } else {
        return 'Thanks for your message! Let me connect you with the right information. Could you provide a bit more detail about what you\'re looking for?';
    }
}

function handleEnter(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}