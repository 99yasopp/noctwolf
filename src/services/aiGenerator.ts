import * as SecureStore from 'expo-secure-store';
import { validateRole, simulateRole } from '../engine/roleGenerator';

export const generateCustomRole = async (prompt: string) => {
  const apiKey = await SecureStore.getItemAsync('openai_api_key');
  if (!apiKey) throw new Error('API Key not set');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: `Generate a Werewolves role in JSON format based on this: ${prompt}` }],
    }),
  });

  const data = await response.json();
  const generatedRole = JSON.parse(data.choices[0].message.content);

  // Run our validation pipeline
  const validation = validateRole(generatedRole);
  if (!validation.valid) throw new Error(validation.error);

  const simulation = simulateRole(generatedRole);
  if (!simulation.valid) throw new Error(simulation.error);

  return generatedRole;
};
