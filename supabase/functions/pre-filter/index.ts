import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Hebrew + English risk keywords (grooming, meetup, sexual, extortion, isolation)
const RISK_KEYWORDS_HE = [
  // Grooming / secrets
  'סוד', 'בינינו', 'אל תספר', 'אל תגיד', 'הורים לא יבינו', 'לא יבינו אותנו',
  'מיוחד', 'מיוחדת', 'רק שלנו', 'לא צריך לדעת',
  // Meetup
  'בוא נפגש', 'נפגש', 'איפה אתה גר', 'איפה את גרה', 'תן מספר', 'תני מספר',
  'מספר טלפון', 'כתובת', 'איפה הבית', 'לאן ללכת',
  // Sexual content
  'תמונה שלך', 'תראה לי', 'תראי לי', 'יפה', 'יפהפה', 'סקסי', 'חמוד', 'חמודה',
  'גוף', 'עירום', 'בגדים', 'תתפשט', 'תתפשטי', 'נשיקה', 'אהבה',
  // Extortion
  'אספר לכולם', 'אפרסם', 'תשלם', 'תשלמי', 'אגיד להורים', 'סרטון', 'תמונות',
  // Isolation
  'אל תגיד לאף אחד', 'רק אני מבין', 'רק אני מבינה', 'אף אחד לא יבין',
  'החברים שלך לא', 'ההורים שלך לא'
];

const RISK_KEYWORDS_EN = [
  // Grooming / secrets
  'secret', 'between us', 'dont tell', "don't tell", 'parents wont understand',
  'special', 'just ours', 'nobody needs to know',
  // Meetup
  'lets meet', "let's meet", 'meet up', 'where do you live', 'your address',
  'give me your number', 'phone number', 'come over',
  // Sexual content
  'send me a pic', 'show me', 'youre cute', "you're cute", 'youre hot', "you're hot",
  'sexy', 'body', 'naked', 'undress', 'kiss',
  // Extortion
  'tell everyone', 'post it', 'pay me', 'tell your parents', 'video', 'photos',
  // Isolation
  'dont tell anyone', "don't tell anyone", 'only i understand', 'your friends dont',
  'your parents dont'
];

// Patterns for phone numbers, addresses, usernames
const RISK_PATTERNS = [
  /\d{9,10}/, // Israeli phone
  /\+?\d{10,15}/, // International phone
  /\d{1,3}[\s,]+[א-ת]+/, // Hebrew address pattern
  /\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road)/i, // English address
  /@[\w]+/, // Username/handle
  /snap(chat)?:?\s*\w+/i, // Snapchat
  /insta(gram)?:?\s*\w+/i, // Instagram
  /tik\s*tok:?\s*\w+/i, // TikTok
];

// Critical codes that always trigger Smart Agent
const CRITICAL_CODES = ['MEETUP', 'EXTORTION', 'NUDES_REQUEST', 'ISOLATION'];

interface PreFilterResult {
  message_id: string;
  is_suspicious: boolean;
  matched_keywords: string[];
  matched_patterns: string[];
  risk_codes: string[];
  priority: 'immediate' | 'batch';
}

interface Message {
  id: string;
  text_content: string | null;
  image_caption: string | null;
  sender_label: string;
  is_child_sender: boolean;
}

function detectRiskCodes(keywords: string[], patterns: string[]): string[] {
  const codes: string[] = [];
  
  // Check for grooming patterns
  if (keywords.some(k => ['סוד', 'בינינו', 'secret', 'between us'].includes(k.toLowerCase()))) {
    codes.push('GROOMING');
  }
  
  // Check for meetup
  if (keywords.some(k => ['נפגש', 'כתובת', 'meet', 'address'].some(m => k.toLowerCase().includes(m)))) {
    codes.push('MEETUP');
  }
  
  // Check for sexual content
  if (keywords.some(k => ['סקסי', 'עירום', 'תתפשט', 'sexy', 'naked', 'undress'].some(m => k.toLowerCase().includes(m)))) {
    codes.push('SEXUAL');
  }
  
  // Check for nudes request
  if (keywords.some(k => ['תמונה שלך', 'תראה לי', 'send me a pic', 'show me'].some(m => k.toLowerCase().includes(m)))) {
    codes.push('NUDES_REQUEST');
  }
  
  // Check for extortion
  if (keywords.some(k => ['אספר', 'אפרסם', 'תשלם', 'tell everyone', 'post it', 'pay'].some(m => k.toLowerCase().includes(m)))) {
    codes.push('EXTORTION');
  }
  
  // Check for isolation
  if (keywords.some(k => ['אף אחד', 'רק אני', 'nobody', 'only i'].some(m => k.toLowerCase().includes(m)))) {
    codes.push('ISOLATION');
  }
  
  // Check for phone/address in patterns
  if (patterns.length > 0) {
    codes.push('CONTACT_INFO');
  }
  
  return [...new Set(codes)];
}

function analyzeMessage(message: Message): PreFilterResult {
  const text = `${message.text_content || ''} ${message.image_caption || ''}`.toLowerCase();
  const matchedKeywords: string[] = [];
  const matchedPatterns: string[] = [];
  
  // Check Hebrew keywords
  for (const keyword of RISK_KEYWORDS_HE) {
    if (text.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  }
  
  // Check English keywords
  for (const keyword of RISK_KEYWORDS_EN) {
    if (text.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  }
  
  // Check patterns
  for (const pattern of RISK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matchedPatterns.push(match[0]);
    }
  }
  
  const isSuspicious = matchedKeywords.length > 0 || matchedPatterns.length > 0;
  const riskCodes = detectRiskCodes(matchedKeywords, matchedPatterns);
  
  // Determine priority - critical codes go to immediate processing
  const hasCritical = riskCodes.some(code => CRITICAL_CODES.includes(code));
  const priority = hasCritical ? 'immediate' : (isSuspicious ? 'immediate' : 'batch');
  
  return {
    message_id: message.id,
    is_suspicious: isSuspicious,
    matched_keywords: matchedKeywords,
    matched_patterns: matchedPatterns,
    risk_codes: riskCodes,
    priority
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages }: { messages: Message[] } = await req.json();
    
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'messages array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const results = messages.map(analyzeMessage);
    
    const suspicious = results.filter(r => r.is_suspicious);
    const clean = results.filter(r => !r.is_suspicious);
    const immediate = results.filter(r => r.priority === 'immediate');
    const batch = results.filter(r => r.priority === 'batch');
    
    console.log(`Pre-filter: ${messages.length} messages -> ${suspicious.length} suspicious, ${clean.length} clean`);
    
    return new Response(
      JSON.stringify({
        results,
        summary: {
          total: messages.length,
          suspicious: suspicious.length,
          clean: clean.length,
          immediate: immediate.length,
          batch: batch.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Pre-filter error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
