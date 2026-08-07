const axios = require('axios');
require('dotenv').config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

(async () => {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
        const response = await axios.get(url);
        console.log('Modelos disponíveis:');
        response.data.models.forEach(m => console.log(`- ${m.name}`));
    } catch (e) {
        console.error('Erro ao listar modelos:', e.response ? e.response.data : e.message);
    }
})();
