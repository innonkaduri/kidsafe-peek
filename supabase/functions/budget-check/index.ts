import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Budget thresholds
const SOFT_LIMIT_USD = 4.50;
const HARD_LIMIT_USD = 5.00;
const MAX_FALLBACK_CALLS = 30;

// Throttling adjustments when over budget
const THROTTLED_RISK_THRESHOLD = 45;  // Normally 40
const THROTTLED_HEARTBEAT_MINUTES = 90;  // Normally 60

interface BudgetStatus {
  child_id: string;
  month: string;
  est_cost_usd: number;
  small_calls: number;
  smart_calls: number;
  fallback_calls: number;
  image_caption_calls: number;
  is_over_soft_limit: boolean;
  is_over_hard_limit: boolean;
  fallback_allowed: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log('Budget Check: Analyzing usage across all children...');
    
    const monthKey = new Date().toISOString().slice(0, 7);
    
    // Get all usage meters for current month
    const { data: usageData, error: usageError } = await supabase
      .from('usage_meter')
      .select(`
        *,
        children!inner(display_name, user_id)
      `)
      .eq('month_yyyy_mm', monthKey);
    
    if (usageError) throw usageError;
    
    const budgetStatuses: BudgetStatus[] = [];
    const childrenOverBudget: string[] = [];
    const adjustedChildren: string[] = [];
    
    for (const usage of usageData || []) {
      const estCost = parseFloat(usage.est_cost_usd) || 0;
      const fallbackCalls = usage.fallback_calls || 0;
      
      const isOverSoft = estCost > SOFT_LIMIT_USD;
      const isOverHard = estCost > HARD_LIMIT_USD;
      const fallbackAllowed = fallbackCalls < MAX_FALLBACK_CALLS && !isOverHard;
      
      budgetStatuses.push({
        child_id: usage.child_id,
        month: usage.month_yyyy_mm,
        est_cost_usd: estCost,
        small_calls: usage.small_calls || 0,
        smart_calls: usage.smart_calls || 0,
        fallback_calls: fallbackCalls,
        image_caption_calls: usage.image_caption_calls || 0,
        is_over_soft_limit: isOverSoft,
        is_over_hard_limit: isOverHard,
        fallback_allowed: fallbackAllowed
      });
      
      if (isOverSoft) {
        childrenOverBudget.push(usage.child_id);
        
        // Get all chats for this child and adjust their scan intervals
        const { data: chats } = await supabase
          .from('chats')
          .select('id')
          .eq('child_id', usage.child_id);
        
        for (const chat of chats || []) {
          await supabase.from('scan_checkpoints').upsert({
            chat_id: chat.id,
            scan_interval_minutes: THROTTLED_HEARTBEAT_MINUTES,
            updated_at: new Date().toISOString()
          }, { onConflict: 'chat_id' });
        }
        
        adjustedChildren.push(usage.child_id);
        console.log(`Budget throttle applied to child ${usage.child_id}: $${estCost.toFixed(2)}/${SOFT_LIMIT_USD}`);
      }
      
      if (isOverHard) {
        console.warn(`CRITICAL: Child ${usage.child_id} over hard limit: $${estCost.toFixed(2)}/${HARD_LIMIT_USD}`);
      }
    }
    
    // Calculate total costs and projections
    const totalCost = budgetStatuses.reduce((sum, b) => sum + b.est_cost_usd, 0);
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const currentDay = new Date().getDate();
    const projectedMonthCost = (totalCost / currentDay) * daysInMonth;
    
    const summary = {
      month: monthKey,
      total_children: budgetStatuses.length,
      total_cost_usd: totalCost,
      avg_cost_per_child: budgetStatuses.length > 0 ? totalCost / budgetStatuses.length : 0,
      projected_month_cost: projectedMonthCost,
      children_over_soft_limit: childrenOverBudget.length,
      children_adjusted: adjustedChildren.length,
      throttle_settings: {
        risk_threshold: THROTTLED_RISK_THRESHOLD,
        heartbeat_minutes: THROTTLED_HEARTBEAT_MINUTES,
        max_fallback_calls: MAX_FALLBACK_CALLS
      }
    };
    
    console.log('Budget Check Summary:', JSON.stringify(summary, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        budget_statuses: budgetStatuses
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Budget Check error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
