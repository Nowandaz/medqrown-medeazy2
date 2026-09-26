import fs from "fs";

let content = fs.readFileSync("artifacts/medqrown/client/src/pages/admin/exam-detail.tsx", "utf-8");

// 1. Add import
content = content.replace(
  'import { MedQrownBrand } from "@/components/MedQrownBrand";',
  'import { MedQrownBrand } from "@/components/MedQrownBrand";\\nimport { AnalyticsTab } from "@/components/admin/analytics-tab";'
);

const newTabsList = \`<TabsList className="mb-6 flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="overview" className="text-xs gap-1" data-testid="tab-overview">
              <Eye className="w-3 h-3" />Overview
            </TabsTrigger>
            <TabsTrigger value="questions" className="text-xs gap-1" data-testid="tab-questions">
              <FileText className="w-3 h-3" />Questions
            </TabsTrigger>
            <TabsTrigger value="setup" className="text-xs gap-1" data-testid="tab-setup">
              <Settings className="w-3 h-3" />Setup
            </TabsTrigger>
            <TabsTrigger value="marking" className="text-xs gap-1" data-testid="tab-marking">
              <Brain className="w-3 h-3" />Marking
            </TabsTrigger>
            <TabsTrigger value="results" className="text-xs gap-1" data-testid="tab-results">
              <Trophy className="w-3 h-3" />Results
            </TabsTrigger>
            <TabsTrigger value="feedback" className="text-xs gap-1 relative" data-testid="tab-feedback">
              <MessageSquare className="w-3 h-3" />Feedback
              {(feedback?.length ?? 0) > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                  {feedback!.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>\`;

content = content.replace(/<TabsList[^]*?<\/TabsList>/m, newTabsList);

const newTabsContent = \`<TabsContent value="overview">
            <OverviewTab stats={stats} examId={examId} exam={exam} />
          </TabsContent>
          <TabsContent value="questions">
            <QuestionsTab examId={examId} questions={examQuestions || []} />
          </TabsContent>
          <TabsContent value="setup">
            <SetupTab exam={exam} examId={examId} />
          </TabsContent>
          <TabsContent value="marking">
            <div className="space-y-6">
              <MarkingTab examId={examId} responses={examResponses || []} stats={stats} />
              <ReattemptsTab examId={examId} />
            </div>
          </TabsContent>
          <TabsContent value="results">
            <div className="space-y-6">
              <RankingsTab rankings={rankings || []} examId={examId} />
              <AnalyticsTab analytics={analytics || []} examId={examId} />
            </div>
          </TabsContent>
          <TabsContent value="feedback">
            <FeedbackTab feedback={feedback || []} examId={examId} />
          </TabsContent>\`;

content = content.replace(/<TabsContent value="overview">[^]*?<\/TabsContent>\\s*<TabsContent value="reattempts">[^]*?<\/TabsContent>/m, newTabsContent);

// Fix OverviewTab
content = content.replace(/function OverviewTab\\({ stats, examStudents, examId, exam }: any\\) {/g, "function OverviewTab({ stats, examId, exam }: any) {");

// Remove old tabs
content = content.replace(/function StudentsTab\\(\\{[^]*?\\n\\}\\n/m, "");
content = content.replace(/function AnalyticsTab\\(\\{[^]*?\\n\\}\\n/m, "");
content = content.replace(/function EmailsTab\\(\\{[^]*?\\n\\}\\n/m, "");
content = content.replace(/function InstructionsTab\\(\\{[^]*?\\n\\}\\n/m, "");

const setupTabString = "function SetupTab({ exam, examId }: { exam: any; examId: number }) {\\n" +
"  const { toast } = useToast();\\n" +
"  const [maxAttempts, setMaxAttempts] = useState(exam.maxAttempts || 1);\\n" +
"  const [durationMinutes, setDurationMinutes] = useState(exam.durationMinutes || 60);\\n" +
"  const [opensAt, setOpensAt] = useState(exam.opensAt ? new Date(exam.opensAt).toISOString().slice(0, 16) : \\"\\");\\n" +
"  const [closesAt, setClosesAt] = useState(exam.closesAt ? new Date(exam.closesAt).toISOString().slice(0, 16) : \\"\\");\\n" +
"  const [instructions, setInstructions] = useState<string>(exam.instructions ?? \\"\\");\\n" +
"\\n" +
"  const updateSetup = useMutation({\\n" +
"    mutationFn: async () => {\\n" +
"      await apiRequest(\\"PATCH\\", `/api/exams/\${examId}`, {\\n" +
"        maxAttempts,\\n" +
"        durationMinutes,\\n" +
"        opensAt: opensAt ? new Date(opensAt).toISOString() : undefined,\\n" +
"        closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,\\n" +
"        instructions: instructions.trim() || null\\n" +
"      });\\n" +
"    },\\n" +
"    onSuccess: () => {\\n" +
"      queryClient.invalidateQueries({ queryKey: [\\"/api/exams\\", examId] });\\n" +
"      toast({ title: \\"Setup saved\\" });\\n" +
"    },\\n" +
"    onError: (e: any) => {\\n" +
"      toast({ title: \\"Failed to save setup\\", description: e.message, variant: \\"destructive\\" });\\n" +
"    }\\n" +
"  });\\n" +
"\\n" +
"  return (\\n" +
"    <div className=\\"max-w-xl space-y-4\\">\\n" +
"      <Card className=\\"shadow-sm border-primary/10\\">\\n" +
"        <CardHeader className=\\"pb-3\\">\\n" +
"          <h3 className=\\"font-semibold flex items-center gap-2\\">\\n" +
"            <Settings className=\\"w-4 h-4 text-primary\\" />\\n" +
"            Exam Setup\\n" +
"          </h3>\\n" +
"        </CardHeader>\\n" +
"        <CardContent className=\\"space-y-4\\">\\n" +
"          <div className=\\"space-y-2\\">\\n" +
"            <Label>Opens At (Nairobi Time)</Label>\\n" +
"            <Input\\n" +
"              type=\\"datetime-local\\"\\n" +
"              value={opensAt}\\n" +
"              onChange={(e) => setOpensAt(e.target.value)}\\n" +
"            />\\n" +
"          </div>\\n" +
"          <div className=\\"space-y-2\\">\\n" +
"            <Label>Closes At (Nairobi Time)</Label>\\n" +
"            <Input\\n" +
"              type=\\"datetime-local\\"\\n" +
"              value={closesAt}\\n" +
"              onChange={(e) => setClosesAt(e.target.value)}\\n" +
"            />\\n" +
"          </div>\\n" +
"          <div className=\\"space-y-2\\">\\n" +
"            <Label>Duration (Minutes)</Label>\\n" +
"            <Input type=\\"number\\" value={durationMinutes} onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)} />\\n" +
"          </div>\\n" +
"          <div className=\\"space-y-2\\">\\n" +
"            <Label>Maximum Attempts</Label>\\n" +
"            <Input\\n" +
"              type=\\"number\\"\\n" +
"              min={1}\\n" +
"              max={100}\\n" +
"              value={maxAttempts}\\n" +
"              onChange={(e) => setMaxAttempts(Math.max(1, parseInt(e.target.value) || 1))}\\n" +
"              data-testid=\\"input-max-attempts\\"\\n" +
"            />\\n" +
"            <p className=\\"text-xs text-muted-foreground\\">Students can request an administrator-approved reattempt after this limit is reached.</p>\\n" +
"          </div>\\n" +
"          <div className=\\"space-y-2 pt-2 border-t border-border\\">\\n" +
"            <Label>Exam Instructions</Label>\\n" +
"            <Textarea\\n" +
"              value={instructions}\\n" +
"              onChange={(e) => setInstructions(e.target.value)}\\n" +
"              placeholder=\\"Write custom instructions shown to students before they begin the exam...\\"\\n" +
"              rows={4}\\n" +
"            />\\n" +
"            <p className=\\"text-xs text-muted-foreground\\">\\n" +
"              Leave empty to use the auto-generated instructions based on timer settings.\\n" +
"            </p>\\n" +
"          </div>\\n" +
"          <Button onClick={() => updateSetup.mutate()} disabled={updateSetup.isPending} className=\\"shadow-sm w-full\\" data-testid=\\"button-save-setup\\">\\n" +
"            {updateSetup.isPending ? \\"Saving...\\" : \\"Save Setup\\"}\\n" +
"          </Button>\\n" +
"        </CardContent>\\n" +
"      </Card>\\n" +
"    </div>\\n" +
"  );\\n" +
"}\\n\\nfunction ReattemptsTab";

content = content.replace(/function SettingsTab\\(\\{[^]*?function ReattemptsTab/m, setupTabString);

fs.writeFileSync("artifacts/medqrown/client/src/pages/admin/exam-detail.tsx", content);
