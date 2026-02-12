import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Heart, ChevronDown, ChevronUp } from "lucide-react";

const MOOD_LABELS = ["Terrible", "Bad", "Okay", "Good", "Great"];
const ENERGY_LABELS = ["Exhausted", "Low", "Moderate", "High", "Energized"];
const STRESS_LABELS = ["Relaxed", "Low", "Moderate", "High", "Overwhelmed"];

function WellnessTab() {
  const { toast } = useToast();
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(2);
  const [showCheckin, setShowCheckin] = useState(false);
  const [aiWellness, setAiWellness] = useState<any>(null);
  const [aiWellnessLoading, setAiWellnessLoading] = useState(true);

  useEffect(() => {
    const cached = sessionStorage.getItem("aiWellnessAdvisor");
    if (cached) {
      try { setAiWellness(JSON.parse(cached)); setAiWellnessLoading(false); return; } catch {}
    }
    apiRequest("POST", "/api/ai/wellness-advisor")
      .then((res) => res.json())
      .then((data) => { setAiWellness(data); sessionStorage.setItem("aiWellnessAdvisor", JSON.stringify({ data: data, ts: Date.now() })); })
      .catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); })
      .finally(() => setAiWellnessLoading(false));
  }, []);

  const [showWellnessAI, setShowWellnessAI] = useState(false);
  const [aiBurnoutRisk, setAiBurnoutRisk] = useState<any>(null);
  const [aiBurnoutRiskLoading, setAiBurnoutRiskLoading] = useState(false);
  const [aiMeditation, setAiMeditation] = useState<any>(null);
  const [aiMeditationLoading, setAiMeditationLoading] = useState(false);
  const [aiWorkLife, setAiWorkLife] = useState<any>(null);
  const [aiWorkLifeLoading, setAiWorkLifeLoading] = useState(false);
  const [aiMentalHealth, setAiMentalHealth] = useState<any>(null);
  const [aiMentalHealthLoading, setAiMentalHealthLoading] = useState(false);
  const [aiSleep, setAiSleep] = useState<any>(null);
  const [aiSleepLoading, setAiSleepLoading] = useState(false);
  const [aiExercise, setAiExercise] = useState<any>(null);
  const [aiExerciseLoading, setAiExerciseLoading] = useState(false);
  const [aiEyeStrain, setAiEyeStrain] = useState<any>(null);
  const [aiEyeStrainLoading, setAiEyeStrainLoading] = useState(false);
  const [aiVoiceCare, setAiVoiceCare] = useState<any>(null);
  const [aiVoiceCareLoading, setAiVoiceCareLoading] = useState(false);
  const [aiStressMgmt, setAiStressMgmt] = useState<any>(null);
  const [aiStressMgmtLoading, setAiStressMgmtLoading] = useState(false);
  const [aiBreakSched, setAiBreakSched] = useState<any>(null);
  const [aiBreakSchedLoading, setAiBreakSchedLoading] = useState(false);

  const [showHealthAI, setShowHealthAI] = useState(false);
  const [aiErgonomicH, setAiErgonomicH] = useState<any>(null);
  const [aiErgonomicHLoading, setAiErgonomicHLoading] = useState(false);
  const [aiEyeCareH, setAiEyeCareH] = useState<any>(null);
  const [aiEyeCareHLoading, setAiEyeCareHLoading] = useState(false);
  const [aiVocalHealthH, setAiVocalHealthH] = useState<any>(null);
  const [aiVocalHealthHLoading, setAiVocalHealthHLoading] = useState(false);
  const [aiSleepOptH, setAiSleepOptH] = useState<any>(null);
  const [aiSleepOptHLoading, setAiSleepOptHLoading] = useState(false);
  const [aiNutritionH, setAiNutritionH] = useState<any>(null);
  const [aiNutritionHLoading, setAiNutritionHLoading] = useState(false);
  const [aiExerciseH, setAiExerciseH] = useState<any>(null);
  const [aiExerciseHLoading, setAiExerciseHLoading] = useState(false);
  const [aiStressMgmtH, setAiStressMgmtH] = useState<any>(null);
  const [aiStressMgmtHLoading, setAiStressMgmtHLoading] = useState(false);
  const [aiWorkLifeH, setAiWorkLifeH] = useState<any>(null);
  const [aiWorkLifeHLoading, setAiWorkLifeHLoading] = useState(false);
  const [aiBurnoutRecovH, setAiBurnoutRecovH] = useState<any>(null);
  const [aiBurnoutRecovHLoading, setAiBurnoutRecovHLoading] = useState(false);
  const [aiMeditationH, setAiMeditationH] = useState<any>(null);
  const [aiMeditationHLoading, setAiMeditationHLoading] = useState(false);
  const [aiTimeBlockH, setAiTimeBlockH] = useState<any>(null);
  const [aiTimeBlockHLoading, setAiTimeBlockHLoading] = useState(false);
  const [aiPomodoroH, setAiPomodoroH] = useState<any>(null);
  const [aiPomodoroHLoading, setAiPomodoroHLoading] = useState(false);
  const [aiDigDetoxH, setAiDigDetoxH] = useState<any>(null);
  const [aiDigDetoxHLoading, setAiDigDetoxHLoading] = useState(false);
  const [aiGratitudeH, setAiGratitudeH] = useState<any>(null);
  const [aiGratitudeHLoading, setAiGratitudeHLoading] = useState(false);
  const [aiAffirmH, setAiAffirmH] = useState<any>(null);
  const [aiAffirmHLoading, setAiAffirmHLoading] = useState(false);
  const [aiHabitStackH, setAiHabitStackH] = useState<any>(null);
  const [aiHabitStackHLoading, setAiHabitStackHLoading] = useState(false);
  const [aiEnergyH, setAiEnergyH] = useState<any>(null);
  const [aiEnergyHLoading, setAiEnergyHLoading] = useState(false);
  const [aiCreatorCommH, setAiCreatorCommH] = useState<any>(null);
  const [aiCreatorCommHLoading, setAiCreatorCommHLoading] = useState(false);
  const [aiMastermindH, setAiMastermindH] = useState<any>(null);
  const [aiMastermindHLoading, setAiMastermindHLoading] = useState(false);

  const [showWellProdAI, setShowWellProdAI] = useState(false);
  const [aiBurnoutPrev, setAiBurnoutPrev] = useState<any>(null);
  const [aiBurnoutPrevLoading, setAiBurnoutPrevLoading] = useState(false);
  const [aiBatchPlanner, setAiBatchPlanner] = useState<any>(null);
  const [aiBatchPlannerLoading, setAiBatchPlannerLoading] = useState(false);
  const [aiCreativeBlock, setAiCreativeBlock] = useState<any>(null);
  const [aiCreativeBlockLoading, setAiCreativeBlockLoading] = useState(false);
  const [aiWLBTracker, setAiWLBTracker] = useState<any>(null);
  const [aiWLBTrackerLoading, setAiWLBTrackerLoading] = useState(false);
  const [aiMotivEngine, setAiMotivEngine] = useState<any>(null);
  const [aiMotivEngineLoading, setAiMotivEngineLoading] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_burnout_risk");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBurnoutRisk(e.data); return; } else { sessionStorage.removeItem("ai_burnout_risk"); } } catch {} }
    setAiBurnoutRiskLoading(true);
    apiRequest("POST", "/api/ai/burnout-risk", {}).then(r => r.json()).then(d => { setAiBurnoutRisk(d); sessionStorage.setItem("ai_burnout_risk", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBurnoutRiskLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_meditation");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMeditation(e.data); return; } else { sessionStorage.removeItem("ai_meditation"); } } catch {} }
    setAiMeditationLoading(true);
    apiRequest("POST", "/api/ai/meditation", {}).then(r => r.json()).then(d => { setAiMeditation(d); sessionStorage.setItem("ai_meditation", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMeditationLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_work_life");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiWorkLife(e.data); return; } else { sessionStorage.removeItem("ai_work_life"); } } catch {} }
    setAiWorkLifeLoading(true);
    apiRequest("POST", "/api/ai/work-life-balance", {}).then(r => r.json()).then(d => { setAiWorkLife(d); sessionStorage.setItem("ai_work_life", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiWorkLifeLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mental_health");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMentalHealth(e.data); return; } else { sessionStorage.removeItem("ai_mental_health"); } } catch {} }
    setAiMentalHealthLoading(true);
    apiRequest("POST", "/api/ai/mental-health", {}).then(r => r.json()).then(d => { setAiMentalHealth(d); sessionStorage.setItem("ai_mental_health", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMentalHealthLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sleep");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSleep(e.data); return; } else { sessionStorage.removeItem("ai_sleep"); } } catch {} }
    setAiSleepLoading(true);
    apiRequest("POST", "/api/ai/sleep", {}).then(r => r.json()).then(d => { setAiSleep(d); sessionStorage.setItem("ai_sleep", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSleepLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_exercise");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiExercise(e.data); return; } else { sessionStorage.removeItem("ai_exercise"); } } catch {} }
    setAiExerciseLoading(true);
    apiRequest("POST", "/api/ai/exercise", {}).then(r => r.json()).then(d => { setAiExercise(d); sessionStorage.setItem("ai_exercise", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiExerciseLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_eye_strain");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiEyeStrain(e.data); return; } else { sessionStorage.removeItem("ai_eye_strain"); } } catch {} }
    setAiEyeStrainLoading(true);
    apiRequest("POST", "/api/ai/eye-strain", {}).then(r => r.json()).then(d => { setAiEyeStrain(d); sessionStorage.setItem("ai_eye_strain", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiEyeStrainLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_voice_care");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiVoiceCare(e.data); return; } else { sessionStorage.removeItem("ai_voice_care"); } } catch {} }
    setAiVoiceCareLoading(true);
    apiRequest("POST", "/api/ai/voice-care", {}).then(r => r.json()).then(d => { setAiVoiceCare(d); sessionStorage.setItem("ai_voice_care", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiVoiceCareLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stress_mgmt");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStressMgmt(e.data); return; } else { sessionStorage.removeItem("ai_stress_mgmt"); } } catch {} }
    setAiStressMgmtLoading(true);
    apiRequest("POST", "/api/ai/stress-management", {}).then(r => r.json()).then(d => { setAiStressMgmt(d); sessionStorage.setItem("ai_stress_mgmt", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiStressMgmtLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_break_sched");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBreakSched(e.data); return; } else { sessionStorage.removeItem("ai_break_sched"); } } catch {} }
    setAiBreakSchedLoading(true);
    apiRequest("POST", "/api/ai/break-scheduler", {}).then(r => r.json()).then(d => { setAiBreakSched(d); sessionStorage.setItem("ai_break_sched", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBreakSchedLoading(false));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem("ai_ergonomic");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiErgonomicH(e.data); return; } else { sessionStorage.removeItem("ai_ergonomic"); } } catch {} }
    setAiErgonomicHLoading(true);
    apiRequest("POST", "/api/ai/ergonomic-setup", {}).then(r => r.json()).then(d => { setAiErgonomicH(d); sessionStorage.setItem("ai_ergonomic", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiErgonomicHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_eye_care");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiEyeCareH(e.data); return; } else { sessionStorage.removeItem("ai_eye_care"); } } catch {} }
    setAiEyeCareHLoading(true);
    apiRequest("POST", "/api/ai/eye-care", {}).then(r => r.json()).then(d => { setAiEyeCareH(d); sessionStorage.setItem("ai_eye_care", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiEyeCareHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_vocal_health");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiVocalHealthH(e.data); return; } else { sessionStorage.removeItem("ai_vocal_health"); } } catch {} }
    setAiVocalHealthHLoading(true);
    apiRequest("POST", "/api/ai/vocal-health", {}).then(r => r.json()).then(d => { setAiVocalHealthH(d); sessionStorage.setItem("ai_vocal_health", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiVocalHealthHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_sleep_h");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiSleepOptH(e.data); return; } else { sessionStorage.removeItem("ai_sleep_h"); } } catch {} }
    setAiSleepOptHLoading(true);
    apiRequest("POST", "/api/ai/sleep-optimize", {}).then(r => r.json()).then(d => { setAiSleepOptH(d); sessionStorage.setItem("ai_sleep_h", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiSleepOptHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_nutrition");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiNutritionH(e.data); return; } else { sessionStorage.removeItem("ai_nutrition"); } } catch {} }
    setAiNutritionHLoading(true);
    apiRequest("POST", "/api/ai/nutrition", {}).then(r => r.json()).then(d => { setAiNutritionH(d); sessionStorage.setItem("ai_nutrition", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiNutritionHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_exercise_h");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiExerciseH(e.data); return; } else { sessionStorage.removeItem("ai_exercise_h"); } } catch {} }
    setAiExerciseHLoading(true);
    apiRequest("POST", "/api/ai/exercise", {}).then(r => r.json()).then(d => { setAiExerciseH(d); sessionStorage.setItem("ai_exercise_h", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiExerciseHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_stress_mgmt_h");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiStressMgmtH(e.data); return; } else { sessionStorage.removeItem("ai_stress_mgmt_h"); } } catch {} }
    setAiStressMgmtHLoading(true);
    apiRequest("POST", "/api/ai/stress-management", {}).then(r => r.json()).then(d => { setAiStressMgmtH(d); sessionStorage.setItem("ai_stress_mgmt_h", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiStressMgmtHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_work_life_h");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiWorkLifeH(e.data); return; } else { sessionStorage.removeItem("ai_work_life_h"); } } catch {} }
    setAiWorkLifeHLoading(true);
    apiRequest("POST", "/api/ai/work-life-balance", {}).then(r => r.json()).then(d => { setAiWorkLifeH(d); sessionStorage.setItem("ai_work_life_h", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiWorkLifeHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_burnout_recov");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBurnoutRecovH(e.data); return; } else { sessionStorage.removeItem("ai_burnout_recov"); } } catch {} }
    setAiBurnoutRecovHLoading(true);
    apiRequest("POST", "/api/ai/burnout-recovery", {}).then(r => r.json()).then(d => { setAiBurnoutRecovH(d); sessionStorage.setItem("ai_burnout_recov", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBurnoutRecovHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_meditation_h");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMeditationH(e.data); return; } else { sessionStorage.removeItem("ai_meditation_h"); } } catch {} }
    setAiMeditationHLoading(true);
    apiRequest("POST", "/api/ai/meditation", {}).then(r => r.json()).then(d => { setAiMeditationH(d); sessionStorage.setItem("ai_meditation_h", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMeditationHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_time_block");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiTimeBlockH(e.data); return; } else { sessionStorage.removeItem("ai_time_block"); } } catch {} }
    setAiTimeBlockHLoading(true);
    apiRequest("POST", "/api/ai/time-blocking", {}).then(r => r.json()).then(d => { setAiTimeBlockH(d); sessionStorage.setItem("ai_time_block", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiTimeBlockHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_pomodoro");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiPomodoroH(e.data); return; } else { sessionStorage.removeItem("ai_pomodoro"); } } catch {} }
    setAiPomodoroHLoading(true);
    apiRequest("POST", "/api/ai/pomodoro", {}).then(r => r.json()).then(d => { setAiPomodoroH(d); sessionStorage.setItem("ai_pomodoro", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiPomodoroHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_dig_detox");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiDigDetoxH(e.data); return; } else { sessionStorage.removeItem("ai_dig_detox"); } } catch {} }
    setAiDigDetoxHLoading(true);
    apiRequest("POST", "/api/ai/digital-detox", {}).then(r => r.json()).then(d => { setAiDigDetoxH(d); sessionStorage.setItem("ai_dig_detox", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiDigDetoxHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_gratitude");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiGratitudeH(e.data); return; } else { sessionStorage.removeItem("ai_gratitude"); } } catch {} }
    setAiGratitudeHLoading(true);
    apiRequest("POST", "/api/ai/gratitude-journal", {}).then(r => r.json()).then(d => { setAiGratitudeH(d); sessionStorage.setItem("ai_gratitude", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiGratitudeHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_affirm");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiAffirmH(e.data); return; } else { sessionStorage.removeItem("ai_affirm"); } } catch {} }
    setAiAffirmHLoading(true);
    apiRequest("POST", "/api/ai/affirmations", {}).then(r => r.json()).then(d => { setAiAffirmH(d); sessionStorage.setItem("ai_affirm", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiAffirmHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_habit_stack");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiHabitStackH(e.data); return; } else { sessionStorage.removeItem("ai_habit_stack"); } } catch {} }
    setAiHabitStackHLoading(true);
    apiRequest("POST", "/api/ai/habit-stack", {}).then(r => r.json()).then(d => { setAiHabitStackH(d); sessionStorage.setItem("ai_habit_stack", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiHabitStackHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_energy");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiEnergyH(e.data); return; } else { sessionStorage.removeItem("ai_energy"); } } catch {} }
    setAiEnergyHLoading(true);
    apiRequest("POST", "/api/ai/energy-management", {}).then(r => r.json()).then(d => { setAiEnergyH(d); sessionStorage.setItem("ai_energy", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiEnergyHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_creator_comm_h");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCreatorCommH(e.data); return; } else { sessionStorage.removeItem("ai_creator_comm_h"); } } catch {} }
    setAiCreatorCommHLoading(true);
    apiRequest("POST", "/api/ai/creator-community", {}).then(r => r.json()).then(d => { setAiCreatorCommH(d); sessionStorage.setItem("ai_creator_comm_h", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCreatorCommHLoading(false));
  }, []);
  useEffect(() => {
    const cached = sessionStorage.getItem("ai_mastermind_h");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMastermindH(e.data); return; } else { sessionStorage.removeItem("ai_mastermind_h"); } } catch {} }
    setAiMastermindHLoading(true);
    apiRequest("POST", "/api/ai/mastermind-group", {}).then(r => r.json()).then(d => { setAiMastermindH(d); sessionStorage.setItem("ai_mastermind_h", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMastermindHLoading(false));
  }, []);

  useEffect(() => {
    if (!showWellProdAI) return;
    const cached = sessionStorage.getItem("ai_burnout_prev");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBurnoutPrev(e.data); return; } else { sessionStorage.removeItem("ai_burnout_prev"); } } catch {} }
    setAiBurnoutPrevLoading(true);
    apiRequest("POST", "/api/ai/burnout-prevention", {}).then(r => r.json()).then(d => { setAiBurnoutPrev(d); sessionStorage.setItem("ai_burnout_prev", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBurnoutPrevLoading(false));
  }, [showWellProdAI]);
  useEffect(() => {
    if (!showWellProdAI) return;
    const cached = sessionStorage.getItem("ai_batch_planner");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiBatchPlanner(e.data); return; } else { sessionStorage.removeItem("ai_batch_planner"); } } catch {} }
    setAiBatchPlannerLoading(true);
    apiRequest("POST", "/api/ai/content-batching-planner", {}).then(r => r.json()).then(d => { setAiBatchPlanner(d); sessionStorage.setItem("ai_batch_planner", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiBatchPlannerLoading(false));
  }, [showWellProdAI]);
  useEffect(() => {
    if (!showWellProdAI) return;
    const cached = sessionStorage.getItem("ai_creative_block");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiCreativeBlock(e.data); return; } else { sessionStorage.removeItem("ai_creative_block"); } } catch {} }
    setAiCreativeBlockLoading(true);
    apiRequest("POST", "/api/ai/creative-block-solver", {}).then(r => r.json()).then(d => { setAiCreativeBlock(d); sessionStorage.setItem("ai_creative_block", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiCreativeBlockLoading(false));
  }, [showWellProdAI]);
  useEffect(() => {
    if (!showWellProdAI) return;
    const cached = sessionStorage.getItem("ai_wlb_tracker");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiWLBTracker(e.data); return; } else { sessionStorage.removeItem("ai_wlb_tracker"); } } catch {} }
    setAiWLBTrackerLoading(true);
    apiRequest("POST", "/api/ai/work-life-balance-tracker", {}).then(r => r.json()).then(d => { setAiWLBTracker(d); sessionStorage.setItem("ai_wlb_tracker", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiWLBTrackerLoading(false));
  }, [showWellProdAI]);
  useEffect(() => {
    if (!showWellProdAI) return;
    const cached = sessionStorage.getItem("ai_motiv_engine");
    if (cached) { try { const e = JSON.parse(cached); if (e.ts && Date.now() - e.ts < 1800000) { setAiMotivEngine(e.data); return; } else { sessionStorage.removeItem("ai_motiv_engine"); } } catch {} }
    setAiMotivEngineLoading(true);
    apiRequest("POST", "/api/ai/motivation-engine", {}).then(r => r.json()).then(d => { setAiMotivEngine(d); sessionStorage.setItem("ai_motiv_engine", JSON.stringify({ data: d, ts: Date.now() })); }).catch(() => { toast({ title: "AI feature unavailable", variant: "destructive" }); }).finally(() => setAiMotivEngineLoading(false));
  }, [showWellProdAI]);

  const renderAIList = (arr: any[] | undefined, limit = 5) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return <p className="text-xs text-muted-foreground italic">No results available</p>;
    return arr.slice(0, limit).map((item: any, i: number) => (
      <p key={i}>{typeof item === "string" ? item : item.title || item.name || item.description || item.text || item.label || JSON.stringify(item)}</p>
    ));
  };

  const { data: checks, isLoading } = useQuery<any[]>({ queryKey: ['/api/wellness'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/wellness", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wellness'] });
      setShowCheckin(false);
      toast({ title: "Check-in saved" });
    },
  });

  const handleCheckin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      mood, energy, stress,
      hoursWorked: parseFloat(formData.get("hoursWorked") as string) || null,
      notes: formData.get("notes") || null,
    });
  };

  const todayCheck = checks?.[0];
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const checkedInToday = todayCheck && new Date(todayCheck.createdAt) >= todayStart;

  const recentChecks = checks?.slice(0, 7) || [];
  const avgMood = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.mood, 0) / recentChecks.length).toFixed(1) : "—";
  const avgEnergy = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.energy, 0) / recentChecks.length).toFixed(1) : "—";
  const avgStress = recentChecks.length ? (recentChecks.reduce((s: number, c: any) => s + c.stress, 0) / recentChecks.length).toFixed(1) : "—";

  const streak = (() => {
    if (!checks?.length) return 0;
    let count = 0;
    const now = new Date();
    for (let i = 0; i < Math.min(checks.length, 30); i++) {
      const checkDate = new Date(checks[i].createdAt);
      const daysDiff = Math.floor((now.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff <= count + 1) count++;
      else break;
    }
    return count;
  })();

  const moodColor = (val: number) => val <= 1 ? "text-red-400" : val <= 2 ? "text-amber-400" : val <= 3 ? "text-yellow-400" : "text-emerald-400";
  const stressColor = (val: number) => val >= 4 ? "text-red-400" : val >= 3 ? "text-amber-400" : "text-emerald-400";

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;

  const burnoutColor = (level: string) => {
    const l = level?.toLowerCase();
    if (l === "low") return "text-emerald-500";
    if (l === "moderate") return "text-amber-500";
    return "text-red-500";
  };
  const burnoutBg = (level: string) => {
    const l = level?.toLowerCase();
    if (l === "low") return "bg-emerald-500";
    if (l === "moderate") return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6">
      {aiWellnessLoading ? (
        <Skeleton className="h-64 rounded-xl" data-testid="skeleton-ai-wellness" />
      ) : aiWellness ? (
        <Card data-testid="card-ai-wellness">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap space-y-0 pb-2">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Wellness Advisor
            </CardTitle>
            {aiWellness.burnoutRiskLevel && (
              <Badge variant="secondary" className={`text-xs no-default-hover-elevate no-default-active-elevate ${burnoutColor(aiWellness.burnoutRiskLevel)}`} data-testid="badge-burnout-risk">
                {aiWellness.burnoutRiskLevel} Risk
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {aiWellness.burnoutScore != null && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-medium text-muted-foreground">Burnout Score</p>
                  <span className={`text-xs font-medium ${burnoutColor(aiWellness.burnoutRiskLevel || "")}`} data-testid="text-burnout-score">{aiWellness.burnoutScore}/100</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${burnoutBg(aiWellness.burnoutRiskLevel || "")}`} style={{ width: `${aiWellness.burnoutScore}%` }} data-testid="bar-burnout-score" />
                </div>
              </div>
            )}
            {aiWellness.assessment && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Assessment</p>
                <p className="text-sm" data-testid="text-wellness-assessment">{aiWellness.assessment}</p>
              </div>
            )}
            {aiWellness.recommendations?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recommendations</p>
                <div className="space-y-2">
                  {aiWellness.recommendations.map((rec: any, i: number) => (
                    <div key={i} className="flex items-start justify-between gap-2 flex-wrap" data-testid={`wellness-rec-${i}`}>
                      <p className="text-sm">{rec.action}</p>
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        {rec.priority && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{rec.priority}</Badge>}
                        {rec.category && <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{rec.category}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiWellness.breakSuggestion && (
              <div className="bg-muted/50 rounded-md p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Break Suggestion</p>
                {aiWellness.breakSuggestion.duration && <p className="text-sm" data-testid="text-break-duration">Duration: {aiWellness.breakSuggestion.duration}</p>}
                {aiWellness.breakSuggestion.activities?.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {aiWellness.breakSuggestion.activities.map((a: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">{a}</Badge>
                    ))}
                  </div>
                )}
                {aiWellness.breakSuggestion.bestDay && <p className="text-xs text-muted-foreground mt-1">Best day: {aiWellness.breakSuggestion.bestDay}</p>}
              </div>
            )}
            {aiWellness.batchRecordingSchedule && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Batch Recording Schedule</p>
                <p className="text-sm" data-testid="text-batch-schedule">{typeof aiWellness.batchRecordingSchedule === "string" ? aiWellness.batchRecordingSchedule : JSON.stringify(aiWellness.batchRecordingSchedule)}</p>
              </div>
            )}
            {aiWellness.creativeBlockExercises?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Creative Block Exercises</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 pl-4 list-disc">
                  {aiWellness.creativeBlockExercises.map((ex: string, i: number) => <li key={i} data-testid={`creative-exercise-${i}`}>{typeof ex === "string" ? ex : (ex as any).name || JSON.stringify(ex)}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-between items-center gap-4 flex-wrap">
        <h2 data-testid="text-wellness-title" className="text-lg font-semibold">Creator Wellness</h2>
        {!showCheckin && (
          <Button data-testid="button-checkin" size="sm" onClick={() => setShowCheckin(true)}>
            <Heart className="w-4 h-4 mr-1" />
            {checkedInToday ? "Check In Again" : "Daily Check-In"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className={checkedInToday ? "border-emerald-500/30 bg-emerald-500/5" : ""}>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Today</p>
            <p className="text-lg font-bold" data-testid="text-wellness-today">{checkedInToday ? MOOD_LABELS[todayCheck.mood - 1] : "Not yet"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">7-Day Mood</p>
            <p className="text-lg font-bold" data-testid="text-wellness-avg-mood">{avgMood}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">7-Day Energy</p>
            <p className="text-lg font-bold" data-testid="text-wellness-avg-energy">{avgEnergy}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Streak</p>
            <p className="text-lg font-bold" data-testid="text-wellness-streak">{streak} day{streak !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      {showCheckin && (
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleCheckin} className="space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Mood</Label>
                  <span className={`text-sm font-medium ${moodColor(mood)}`}>{MOOD_LABELS[mood - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={mood} onChange={(e) => setMood(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-mood" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Terrible</span><span>Great</span></div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Energy</Label>
                  <span className={`text-sm font-medium ${moodColor(energy)}`}>{ENERGY_LABELS[energy - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={energy} onChange={(e) => setEnergy(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-energy" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Exhausted</span><span>Energized</span></div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label>Stress</Label>
                  <span className={`text-sm font-medium ${stressColor(stress)}`}>{STRESS_LABELS[stress - 1]}</span>
                </div>
                <input type="range" min="1" max="5" value={stress} onChange={(e) => setStress(Number(e.target.value))} className="w-full accent-primary" data-testid="slider-stress" />
                <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>Relaxed</span><span>Overwhelmed</span></div>
              </div>
              <div>
                <Label>Hours Worked Today</Label>
                <Input name="hoursWorked" type="number" step="0.5" min="0" max="24" data-testid="input-hours-worked" placeholder="e.g. 8" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" data-testid="input-wellness-notes" placeholder="How are you feeling?" className="resize-none" />
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={createMutation.isPending} data-testid="button-submit-checkin">
                  {createMutation.isPending ? "Saving..." : "Save Check-In"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCheckin(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {todayCheck?.aiRecommendation && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <p className="text-sm font-medium">AI Recommendation</p>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-ai-wellness-rec">{todayCheck.aiRecommendation}</p>
          </CardContent>
        </Card>
      )}

      {recentChecks.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-3">Recent Check-Ins</p>
          <div className="space-y-2">
            {recentChecks.map((check: any) => (
              <Card key={check.id} data-testid={`card-wellness-${check.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">
                        {new Date(check.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-medium ${moodColor(check.mood)}`}>Mood: {check.mood}/5</span>
                        <span className={`text-xs font-medium ${moodColor(check.energy)}`}>Energy: {check.energy}/5</span>
                        <span className={`text-xs font-medium ${stressColor(check.stress)}`}>Stress: {check.stress}/5</span>
                      </div>
                    </div>
                    {check.hoursWorked != null && (
                      <span className="text-xs text-muted-foreground">{check.hoursWorked}h worked</span>
                    )}
                  </div>
                  {check.notes && <p className="text-xs text-muted-foreground mt-2">{check.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowWellnessAI(!showWellnessAI)}
          data-testid="button-toggle-wellness-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Wellness & Health Suite</span>
          <Badge variant="outline" className="text-[10px]">10 tools</Badge>
          {showWellnessAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showWellnessAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiBurnoutRiskLoading || aiBurnoutRisk) && (
              <Card data-testid="card-ai-burnout-risk">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Burnout Risk</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBurnoutRiskLoading ? <Skeleton className="h-24 w-full" /> : aiBurnoutRisk && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBurnoutRisk.factors || aiBurnoutRisk.recommendations || aiBurnoutRisk.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMeditationLoading || aiMeditation) && (
              <Card data-testid="card-ai-meditation">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Meditation</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMeditationLoading ? <Skeleton className="h-24 w-full" /> : aiMeditation && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMeditation.exercises || aiMeditation.recommendations || aiMeditation.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWorkLifeLoading || aiWorkLife) && (
              <Card data-testid="card-ai-work-life">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Work-Life Balance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWorkLifeLoading ? <Skeleton className="h-24 w-full" /> : aiWorkLife && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWorkLife.tips || aiWorkLife.recommendations || aiWorkLife.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMentalHealthLoading || aiMentalHealth) && (
              <Card data-testid="card-ai-mental-health">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Mental Health</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMentalHealthLoading ? <Skeleton className="h-24 w-full" /> : aiMentalHealth && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMentalHealth.resources || aiMentalHealth.recommendations || aiMentalHealth.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSleepLoading || aiSleep) && (
              <Card data-testid="card-ai-sleep">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Sleep</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSleepLoading ? <Skeleton className="h-24 w-full" /> : aiSleep && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSleep.tips || aiSleep.recommendations || aiSleep.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiExerciseLoading || aiExercise) && (
              <Card data-testid="card-ai-exercise">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Exercise</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiExerciseLoading ? <Skeleton className="h-24 w-full" /> : aiExercise && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiExercise.routines || aiExercise.recommendations || aiExercise.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEyeStrainLoading || aiEyeStrain) && (
              <Card data-testid="card-ai-eye-strain">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Eye Strain</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEyeStrainLoading ? <Skeleton className="h-24 w-full" /> : aiEyeStrain && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEyeStrain.exercises || aiEyeStrain.recommendations || aiEyeStrain.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVoiceCareLoading || aiVoiceCare) && (
              <Card data-testid="card-ai-voice-care">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Voice Care</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVoiceCareLoading ? <Skeleton className="h-24 w-full" /> : aiVoiceCare && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVoiceCare.tips || aiVoiceCare.recommendations || aiVoiceCare.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStressMgmtLoading || aiStressMgmt) && (
              <Card data-testid="card-ai-stress-mgmt">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Stress Management</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStressMgmtLoading ? <Skeleton className="h-24 w-full" /> : aiStressMgmt && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStressMgmt.techniques || aiStressMgmt.recommendations || aiStressMgmt.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBreakSchedLoading || aiBreakSched) && (
              <Card data-testid="card-ai-break-sched">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Break Scheduler</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBreakSchedLoading ? <Skeleton className="h-24 w-full" /> : aiBreakSched && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBreakSched.schedule || aiBreakSched.recommendations || aiBreakSched.results)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowHealthAI(!showHealthAI)}
          data-testid="button-toggle-health-ai"
        >
          <Sparkles className="h-4 w-4 text-green-400" />
          <span className="text-sm font-semibold">AI Creator Health Suite</span>
          <Badge variant="outline" className="text-[10px]">19 tools</Badge>
          {showHealthAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showHealthAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiErgonomicHLoading || aiErgonomicH) && (
              <Card data-testid="card-ai-ergonomic">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Ergonomic Setup</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiErgonomicHLoading ? <Skeleton className="h-24 w-full" /> : aiErgonomicH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiErgonomicH.strategies || aiErgonomicH.tips || aiErgonomicH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEyeCareHLoading || aiEyeCareH) && (
              <Card data-testid="card-ai-eye-care">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Eye Care</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEyeCareHLoading ? <Skeleton className="h-24 w-full" /> : aiEyeCareH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEyeCareH.strategies || aiEyeCareH.tips || aiEyeCareH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiVocalHealthHLoading || aiVocalHealthH) && (
              <Card data-testid="card-ai-vocal-health">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Vocal Health</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiVocalHealthHLoading ? <Skeleton className="h-24 w-full" /> : aiVocalHealthH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiVocalHealthH.strategies || aiVocalHealthH.tips || aiVocalHealthH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiSleepOptHLoading || aiSleepOptH) && (
              <Card data-testid="card-ai-sleep-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Sleep Optimize</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiSleepOptHLoading ? <Skeleton className="h-24 w-full" /> : aiSleepOptH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiSleepOptH.strategies || aiSleepOptH.tips || aiSleepOptH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiNutritionHLoading || aiNutritionH) && (
              <Card data-testid="card-ai-nutrition">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Nutrition</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiNutritionHLoading ? <Skeleton className="h-24 w-full" /> : aiNutritionH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiNutritionH.strategies || aiNutritionH.tips || aiNutritionH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiExerciseHLoading || aiExerciseH) && (
              <Card data-testid="card-ai-exercise-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Exercise</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiExerciseHLoading ? <Skeleton className="h-24 w-full" /> : aiExerciseH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiExerciseH.strategies || aiExerciseH.tips || aiExerciseH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiStressMgmtHLoading || aiStressMgmtH) && (
              <Card data-testid="card-ai-stress-mgmt-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Stress Management</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiStressMgmtHLoading ? <Skeleton className="h-24 w-full" /> : aiStressMgmtH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiStressMgmtH.strategies || aiStressMgmtH.tips || aiStressMgmtH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWorkLifeHLoading || aiWorkLifeH) && (
              <Card data-testid="card-ai-work-life-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Work Life Balance</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWorkLifeHLoading ? <Skeleton className="h-24 w-full" /> : aiWorkLifeH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWorkLifeH.strategies || aiWorkLifeH.tips || aiWorkLifeH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBurnoutRecovHLoading || aiBurnoutRecovH) && (
              <Card data-testid="card-ai-burnout-recov">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Burnout Recovery</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBurnoutRecovHLoading ? <Skeleton className="h-24 w-full" /> : aiBurnoutRecovH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBurnoutRecovH.strategies || aiBurnoutRecovH.tips || aiBurnoutRecovH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMeditationHLoading || aiMeditationH) && (
              <Card data-testid="card-ai-meditation-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Meditation</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMeditationHLoading ? <Skeleton className="h-24 w-full" /> : aiMeditationH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMeditationH.strategies || aiMeditationH.tips || aiMeditationH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiTimeBlockHLoading || aiTimeBlockH) && (
              <Card data-testid="card-ai-time-block">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Time Blocking</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiTimeBlockHLoading ? <Skeleton className="h-24 w-full" /> : aiTimeBlockH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiTimeBlockH.strategies || aiTimeBlockH.tips || aiTimeBlockH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiPomodoroHLoading || aiPomodoroH) && (
              <Card data-testid="card-ai-pomodoro">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Pomodoro</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiPomodoroHLoading ? <Skeleton className="h-24 w-full" /> : aiPomodoroH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiPomodoroH.strategies || aiPomodoroH.tips || aiPomodoroH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiDigDetoxHLoading || aiDigDetoxH) && (
              <Card data-testid="card-ai-dig-detox">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Digital Detox</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiDigDetoxHLoading ? <Skeleton className="h-24 w-full" /> : aiDigDetoxH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiDigDetoxH.strategies || aiDigDetoxH.tips || aiDigDetoxH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiGratitudeHLoading || aiGratitudeH) && (
              <Card data-testid="card-ai-gratitude">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Gratitude Journal</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiGratitudeHLoading ? <Skeleton className="h-24 w-full" /> : aiGratitudeH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiGratitudeH.strategies || aiGratitudeH.tips || aiGratitudeH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiAffirmHLoading || aiAffirmH) && (
              <Card data-testid="card-ai-affirm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Affirmations</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiAffirmHLoading ? <Skeleton className="h-24 w-full" /> : aiAffirmH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiAffirmH.strategies || aiAffirmH.tips || aiAffirmH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiHabitStackHLoading || aiHabitStackH) && (
              <Card data-testid="card-ai-habit-stack">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Habit Stack</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiHabitStackHLoading ? <Skeleton className="h-24 w-full" /> : aiHabitStackH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiHabitStackH.strategies || aiHabitStackH.tips || aiHabitStackH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiEnergyHLoading || aiEnergyH) && (
              <Card data-testid="card-ai-energy">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Energy Management</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiEnergyHLoading ? <Skeleton className="h-24 w-full" /> : aiEnergyH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiEnergyH.strategies || aiEnergyH.tips || aiEnergyH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCreatorCommHLoading || aiCreatorCommH) && (
              <Card data-testid="card-ai-creator-comm-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Creator Community</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCreatorCommHLoading ? <Skeleton className="h-24 w-full" /> : aiCreatorCommH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCreatorCommH.strategies || aiCreatorCommH.tips || aiCreatorCommH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMastermindHLoading || aiMastermindH) && (
              <Card data-testid="card-ai-mastermind-h">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-green-400" />
                    <h3 className="font-semibold text-sm">AI Mastermind Group</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMastermindHLoading ? <Skeleton className="h-24 w-full" /> : aiMastermindH && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMastermindH.strategies || aiMastermindH.tips || aiMastermindH.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <div className="border rounded-md overflow-visible">
        <button
          className="flex items-center gap-2 w-full p-4 text-left"
          onClick={() => setShowWellProdAI(!showWellProdAI)}
          data-testid="button-toggle-well-prod-ai"
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold">AI Wellness & Productivity Suite</span>
          <Badge variant="outline" className="text-[10px]">5 tools</Badge>
          {showWellProdAI ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        {showWellProdAI && (
          <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(aiBurnoutPrevLoading || aiBurnoutPrev) && (
              <Card data-testid="card-ai-burnout-prev">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Burnout Prevention</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBurnoutPrevLoading ? <Skeleton className="h-24 w-full" /> : aiBurnoutPrev && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBurnoutPrev.patterns || aiBurnoutPrev.warnings || aiBurnoutPrev.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiBatchPlannerLoading || aiBatchPlanner) && (
              <Card data-testid="card-ai-batch-planner">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Content Batching Planner</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiBatchPlannerLoading ? <Skeleton className="h-24 w-full" /> : aiBatchPlanner && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiBatchPlanner.schedules || aiBatchPlanner.batches || aiBatchPlanner.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiCreativeBlockLoading || aiCreativeBlock) && (
              <Card data-testid="card-ai-creative-block">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Creative Block Solver</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiCreativeBlockLoading ? <Skeleton className="h-24 w-full" /> : aiCreativeBlock && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiCreativeBlock.ideas || aiCreativeBlock.exercises || aiCreativeBlock.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiWLBTrackerLoading || aiWLBTracker) && (
              <Card data-testid="card-ai-wlb-tracker">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Work-Life Balance Tracker</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiWLBTrackerLoading ? <Skeleton className="h-24 w-full" /> : aiWLBTracker && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiWLBTracker.hours || aiWLBTracker.insights || aiWLBTracker.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {(aiMotivEngineLoading || aiMotivEngine) && (
              <Card data-testid="card-ai-motiv-engine">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="font-semibold text-sm">AI Motivation Engine</h3>
                    <Badge variant="outline" className="text-[10px] ml-auto">Auto-generated</Badge>
                  </div>
                  {aiMotivEngineLoading ? <Skeleton className="h-24 w-full" /> : aiMotivEngine && (
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {renderAIList(aiMotivEngine.wins || aiMotivEngine.celebrations || aiMotivEngine.recommendations)}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default WellnessTab;
