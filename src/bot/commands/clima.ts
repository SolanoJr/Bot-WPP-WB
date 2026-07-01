import { ICommand } from './types';
import axios from 'axios';

export const climaCommand: ICommand = {
    name: 'clima',
    description: 'Consulta o clima de uma cidade.',
    async execute(msg, client, args) {
        if (args.length === 0) {
            await msg.reply('❌ Por favor, informe o nome da cidade. Exemplo: $clima São Paulo');
            return;
        }

        const city = args.join(' ');
        
        try {
            // Usando API Open-Meteo (gratuita, não requer API key)
            const geoResponse = await axios.get(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`
            );

            if (!geoResponse.data.results || geoResponse.data.results.length === 0) {
                await msg.reply('❌ Cidade não encontrada. Verifique o nome e tente novamente.');
                return;
            }

            const location = geoResponse.data.results[0];
            const { latitude, longitude, name, country } = location;

            const weatherResponse = await axios.get(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
            );

            const current = weatherResponse.data.current_weather;
            const daily = weatherResponse.data.daily;

            const temp = Math.round(current.temperature);
            const windSpeed = Math.round(current.windspeed);
            const weatherCode = current.weathercode;

            // Mapear códigos do clima para emojis
            const weatherEmojis: { [key: number]: string } = {
                0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
                45: '🌫️', 48: '🌫️',
                51: '🌧️', 53: '🌧️', 55: '🌧️',
                61: '🌧️', 63: '🌧️', 65: '🌧️',
                71: '🌨️', 73: '🌨️', 75: '🌨️',
                80: '🌦️', 81: '🌦️', 82: '🌦️',
                95: '⛈️', 96: '⛈️', 99: '⛈️'
            };
            const emoji = weatherEmojis[weatherCode] || '🌡️';

            const maxTemp = Math.round(daily.temperature_2m_max[0]);
            const minTemp = Math.round(daily.temperature_2m_min[0]);
            const precipitation = daily.precipitation_sum[0];

            const response = [
                `${emoji} **CLIMA EM ${name.toUpperCase()}**`,
                '',
                `🌡️ **Temperatura atual:** ${temp}°C`,
                `📊 **Máxima/Mínima:** ${maxTemp}°C / ${minTemp}°C`,
                `💨 **Vento:** ${windSpeed} km/h`,
                `🌧️ **Precipitação:** ${precipitation} mm`,
                `📍 **País:** ${country || 'N/A'}`,
                '',
                `_Dados fornecidos por Open-Meteo_`
            ].join('\n');

            await msg.reply(response);
        } catch (error) {
            console.error('Erro ao buscar clima:', error);
            await msg.reply('⚠️ Erro ao consultar o clima. Tente novamente mais tarde.');
        }
    }
};