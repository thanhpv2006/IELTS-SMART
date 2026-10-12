export type ExamRules = { time_limit_minutes: number | null; anti_cheat: boolean; fullscreen: boolean };

export type ViolationType = "leave-tab" | "blur" | "paste-blocked" | "copy" | "exit-fullscreen";
