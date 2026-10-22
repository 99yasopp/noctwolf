import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { validateRole, simulateRole } from '../engine/roleGenerator';
import { stripCodeFence } from '../engine/generatedRole';

export type AiProvider = 'openai' | 'deepseek';

// Both speak the same chat-completions dialect; only the address and the model
// differ, so one request builder serves both.
export const AI_PROVIDERS: Record<AiProvider, { label: string; url: string; model: string }> = {
  deepseek: {
    label: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
  },
  openai: {
    label: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
  },
};

const PROVIDER_KEY = 'ai_provider';
const KEY = 'ai_api_key';
// The build before the provider choice stored an OpenAI key under this name.
const LEGACY_KEY = 'openai_api_key';

// New installs start on the cheaper provider. A key saved by the old build was
// an OpenAI one, so it keeps that provider until the player picks another.
export const loadAiSettings = async (): Promise<{
  provider: AiProvider;
  apiKey: string;
}> => {
  if (Platform.OS === 'web') return { provider: 'deepseek', apiKey: '' };

  try {
    const [stored, current, legacy] = await Promise.all([
      SecureStore.getItemAsync(PROVIDER_KEY),
      SecureStore.getItemAsync(KEY),
      SecureStore.getItemAsync(LEGACY_KEY),
    ]);

    const provider: AiProvider =
      stored === 'openai' || stored === 'deepseek'
        ? stored
        : legacy && !current
        ? 'openai'
        : 'deepseek';

    return { provider, apiKey: current ?? legacy ?? '' };
  } catch (error) {
    console.error('Could not read the AI settings', error);
    return { provider: 'deepseek', apiKey: '' };
  }
};

export const saveAiSettings = async (provider: AiProvider, apiKey: string) => {
  if (Platform.OS === 'web') return;

  await Promise.all([
    SecureStore.setItemAsync(PROVIDER_KEY, provider),
    SecureStore.setItemAsync(KEY, apiKey),
  ]);
};

// The model has to be told the shape this game can actually run: anything else
// fails validation after the request has already been paid for.
const SCHEMA = `You invent roles for a Werewolves party game.
Reply with one JSON object and nothing else, in this shape:
{
  "name": "the role's name",
  "team": "Village" or "Wolf" or "Solitary",
  "description": "one or two sentences",
  "abilities": [
    { "actions": [ { "id": "an action id", "priority": 1 } ] }
  ]
}
Every action id must be one of: kill_action, protect_action, apply_punishment_action, establish_channel_action.
Give each action a different priority.`;

export const generateCustomRole = async (
  prompt: string,
  provider: AiProvider,
  apiKey: string,
) => {
  if (!apiKey) throw new Error('API Key not set');

  const config = AI_PROVIDERS[provider];
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SCHEMA },
        { role: 'user', content: `Invent a role based on this: ${prompt}` },
      ],
    }),
  });

  if (!response.ok) {
    // The provider's own sentence says more than its status number, and a
    // rejected key is usually the wrong provider's key.
    let detail = '';
    try {
      const failure = await response.json();
      if (typeof failure?.error?.message === 'string') detail = failure.error.message;
    } catch {
      // A gateway error may not carry JSON; the status below still speaks.
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `${detail || 'The key was rejected.'} Use a ${config.label} key, or pick the other provider.`,
      );
    }

    throw new Error(detail || `${config.label} answered with status ${response.status}.`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('AI response did not contain a role definition');
  }

  let generatedRole: any;
  try {
    generatedRole = JSON.parse(stripCodeFence(content));
  } catch {
    throw new Error('AI response was not valid JSON');
  }

  // Run our validation pipeline
  const validation = validateRole(generatedRole);
  if (!validation.valid) throw new Error(validation.error);

  const simulation = simulateRole(generatedRole);
  if (!simulation.valid) throw new Error(simulation.error);

  return generatedRole;
};
