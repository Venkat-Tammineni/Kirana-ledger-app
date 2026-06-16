import { useEffect, useMemo, useState } from "react";
import {
  useCreateStaff,
  useMarkStaffAttendance,
  useStaff,
  useStaffDetails,
  useUpdateStaffOverallPayment,
  useUpdateStaffSalary,
  useUpdateStaffSalaryPayment,
  useUpdateStaffTodayPayment,
} from "@/hooks/use-pos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/MetricCard";
import { useToast } from "@/hooks/use-toast";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { formatCurrencyINR, formatDate, toDateInputString } from "@/lib/format";
import { CalendarDays, CheckCircle2, UserPlus, Users, Wallet, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getISTDateKey } from "@shared/timezone";
import { parseVoiceDateInput } from "@/lib/voice-commands";

type StaffDraft = {
  name: string;
  phone: string;
  salaryType: "daily" | "monthly";
  salaryAmount: string;
};

type AttendanceRangeMode = "month" | "custom";

const defaultDraft: StaffDraft = {
  name: "",
  phone: "",
  salaryType: "daily",
  salaryAmount: "",
};

const PRIMARY_WORKER_NAME = "karthik";

function getCurrentMonthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

function getStaffAttendancePayment(
  member: { salaryType: string; salaryAmount: string | number | null },
  entry?: { status: string; payment?: string | number | null } | null,
) {
  if (!entry) return 0;

  if (member.salaryType === "monthly") {
    return entry.status === "present" ? Number(member.salaryAmount || 0) / 30 : 0;
  }

  return Number(entry.payment || 0);
}

export default function Staff() {
  const { toast } = useToast();
  const { data: staff, isLoading } = useStaff();
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const { data: details, isLoading: detailsLoading } = useStaffDetails(selectedStaffId);
  const { mutate: createStaff, isPending: isCreating } = useCreateStaff();
  const { mutate: markAttendance, isPending: isMarking } = useMarkStaffAttendance();
  const { mutate: updateTodayPayment, isPending: isUpdatingTodayPayment } = useUpdateStaffTodayPayment();
  const { mutate: updateOverallPayment, isPending: isUpdatingOverallPayment } = useUpdateStaffOverallPayment();
  const { mutate: updateStaffSalary, isPending: isUpdatingStaffSalary } = useUpdateStaffSalary();
  const { mutate: updateSalaryPayment, isPending: isUpdatingSalaryPayment } = useUpdateStaffSalaryPayment();

  const [draft, setDraft] = useState<StaffDraft>(defaultDraft);
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState<Date>(new Date());
  const [attendanceRangeMode, setAttendanceRangeMode] = useState<AttendanceRangeMode>("month");
  const [customRangeStart, setCustomRangeStart] = useState<Date>(() => getCurrentMonthRange().start);
  const [customRangeEnd, setCustomRangeEnd] = useState<Date>(() => getCurrentMonthRange().end);
  const [todayPaymentInput, setTodayPaymentInput] = useState("");
  const [overallPaymentInput, setOverallPaymentInput] = useState("");
  const [rangePaidInput, setRangePaidInput] = useState("");
  const [salaryTypeInput, setSalaryTypeInput] = useState<"daily" | "monthly">("daily");
  const [salaryAmountInput, setSalaryAmountInput] = useState("");
  const [applySalaryToRange, setApplySalaryToRange] = useState(false);
  const orderedStaff = useMemo(() => {
    return [...(staff ?? [])].sort((a, b) => {
      const aIsPrimary = a.name.trim().toLowerCase() === PRIMARY_WORKER_NAME;
      const bIsPrimary = b.name.trim().toLowerCase() === PRIMARY_WORKER_NAME;
      if (aIsPrimary && !bIsPrimary) return -1;
      if (!aIsPrimary && bIsPrimary) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [staff]);
  const totalPaidToAllStaff = useMemo(
    () => (staff ?? []).reduce((sum, member) => sum + Number(member.totalPayment || 0), 0),
    [staff],
  );

  useEffect(() => {
    if (!selectedStaffId && orderedStaff.length) {
      setSelectedStaffId(orderedStaff[0].id);
    }
  }, [orderedStaff, selectedStaffId]);

  useEffect(() => {
    if (details) {
      setOverallPaymentInput(String(Number(details.summary.totalPayment || 0)));
      setSalaryTypeInput(details.staff.salaryType as "daily" | "monthly");
      setSalaryAmountInput(String(Number(details.staff.salaryAmount || 0)));
      setApplySalaryToRange(false);
    }
  }, [details]);

  const selectedStaff = details?.staff;
  const selectedDateKey = useMemo(() => getISTDateKey(selectedAttendanceDate), [selectedAttendanceDate]);
  const selectedDateLabel = useMemo(() => formatDate(selectedAttendanceDate, "dd MMM yyyy"), [selectedAttendanceDate]);
  const currentMonthRange = useMemo(() => getCurrentMonthRange(), []);
  const attendanceRangeStart = attendanceRangeMode === "month" ? currentMonthRange.start : customRangeStart;
  const attendanceRangeEnd = attendanceRangeMode === "month" ? currentMonthRange.end : customRangeEnd;
  const attendanceRangeStartKey = useMemo(() => getISTDateKey(attendanceRangeStart), [attendanceRangeStart]);
  const attendanceRangeEndKey = useMemo(() => getISTDateKey(attendanceRangeEnd), [attendanceRangeEnd]);
  const attendanceRangeLabel = attendanceRangeMode === "month"
    ? formatDate(currentMonthRange.start, "MMM yyyy")
    : `${formatDate(customRangeStart, "dd MMM yyyy")} to ${formatDate(customRangeEnd, "dd MMM yyyy")}`;
  const selectedAttendance = useMemo(() => {
    return details?.attendance.find((entry) => (entry.date ? getISTDateKey(entry.date) : "") === selectedDateKey) || null;
  }, [details?.attendance, selectedDateKey]);
  const selectedAttendancePayment = selectedStaff
    ? getStaffAttendancePayment(selectedStaff, selectedAttendance)
    : 0;
  const rangeAttendance = useMemo(() => {
    return (details?.attendance || []).filter((entry) => {
      if (!entry.date) return false;
      const entryKey = getISTDateKey(entry.date);
      return entryKey >= attendanceRangeStartKey && entryKey <= attendanceRangeEndKey;
    });
  }, [attendanceRangeEndKey, attendanceRangeStartKey, details?.attendance]);
  const rangeSummary = useMemo(() => {
    if (!selectedStaff) {
      return { presentDays: 0, absentDays: 0, payable: 0 };
    }

    return {
      presentDays: rangeAttendance.filter((entry) => entry.status === "present").length,
      absentDays: rangeAttendance.filter((entry) => entry.status === "absent").length,
      payable: rangeAttendance.reduce((sum, entry) => sum + getStaffAttendancePayment(selectedStaff, entry), 0),
    };
  }, [rangeAttendance, selectedStaff]);
  const rangePayment = useMemo(() => {
    return (details?.payments || []).find((payment) => {
      const paymentStartKey = getISTDateKey(payment.rangeStart);
      const paymentEndKey = getISTDateKey(payment.rangeEnd);
      return paymentStartKey === attendanceRangeStartKey && paymentEndKey === attendanceRangeEndKey;
    }) || null;
  }, [attendanceRangeEndKey, attendanceRangeStartKey, details?.payments]);
  const rangePaidAmount = Number(rangePayment?.amount || 0);
  const rangeBalance = Math.max(0, rangeSummary.payable - rangePaidAmount);

  useEffect(() => {
    setTodayPaymentInput(String(selectedAttendancePayment));
  }, [selectedAttendancePayment]);

  useEffect(() => {
    setRangePaidInput(String(rangePaidAmount));
  }, [rangePaidAmount]);

  const handleCreateStaff = () => {
    if (!draft.name.trim() || !draft.phone.trim() || !draft.salaryAmount) {
      toast({ title: "Missing details", description: "Fill all staff fields before saving.", variant: "destructive" });
      return;
    }

    createStaff(
      {
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        salaryType: draft.salaryType,
        salaryAmount: Number(draft.salaryAmount || 0),
      },
      {
        onSuccess: (created) => {
          setDraft(defaultDraft);
          setSelectedStaffId(created.id);
          toast({ title: "Staff created" });
        },
        onError: (error: Error) => {
          toast({ title: "Failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  const handleMarkAttendance = (status: "present" | "absent") => {
    if (!selectedStaffId) return;
    if (selectedAttendance?.status === status) {
      toast({
        title: "Already marked",
        description: `${selectedStaff?.name || "Staff"} is already marked ${status} for ${selectedDateLabel}.`,
      });
      return;
    }

    markAttendance(
      { staffId: selectedStaffId, status, date: selectedDateKey },
      {
        onSuccess: (attendance) => {
          setTodayPaymentInput(String(Number(attendance.payment || 0)));
          toast({ title: `Marked ${status}` });
        },
        onError: (error: Error) => {
          toast({ title: "Failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  const handleSaveTodayPayment = () => {
    if (!selectedStaffId) return;

    updateTodayPayment(
      {
        staffId: selectedStaffId,
        payment: Number(todayPaymentInput || 0),
        date: selectedDateKey,
      },
      {
        onSuccess: () => {
          toast({ title: "Today's payment updated" });
        },
        onError: (error: Error) => {
          toast({ title: "Failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  const handleSaveOverallPayment = () => {
    if (!selectedStaffId) return;

    updateOverallPayment(
      {
        staffId: selectedStaffId,
        totalPayment: Number(overallPaymentInput || 0),
      },
      {
        onSuccess: () => {
          toast({ title: "Overall payment updated" });
        },
        onError: (error: Error) => {
          toast({ title: "Failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  const handleSaveRangePayment = () => {
    if (!selectedStaffId) return;

    updateSalaryPayment(
      {
        staffId: selectedStaffId,
        rangeStart: attendanceRangeStartKey,
        rangeEnd: attendanceRangeEndKey,
        amount: Number(rangePaidInput || 0),
        note: `Salary paid for ${attendanceRangeLabel}`,
      },
      {
        onSuccess: () => {
          toast({ title: "Salary payment saved", description: `${attendanceRangeLabel} paid amount updated.` });
        },
        onError: (error: Error) => {
          toast({ title: "Failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  const handleSaveStaffSalary = () => {
    if (!selectedStaffId) return;

    updateStaffSalary(
      {
        staffId: selectedStaffId,
        salaryType: salaryTypeInput,
        salaryAmount: Number(salaryAmountInput || 0),
        applyToRange: salaryTypeInput === "daily" ? applySalaryToRange : false,
        rangeStart: attendanceRangeStartKey,
        rangeEnd: attendanceRangeEndKey,
      },
      {
        onSuccess: () => {
          toast({
            title: "Daily payment updated",
            description: applySalaryToRange && salaryTypeInput === "daily"
              ? `Present days in ${attendanceRangeLabel} now use this amount.`
              : "Future attendance will use this amount.",
          });
        },
        onError: (error: Error) => {
          toast({ title: "Failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  const staffVoiceCommands = [
    {
      label: "Mark present or absent",
      examples: ["keep present for karthik on 05-04-2026", "keep absent for karthik on 05-04-2026"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        const match = normalized.match(/^keep\s+(present|absent)\s+for\s+(.+?)\s+on\s+(\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2})$/);
        if (!match) return null;
        const status = match[1] as "present" | "absent";
        const staffQuery = match[2].trim();
        const parsedDate = parseVoiceDateInput(match[3]);
        if (!parsedDate) return "I could not understand that staff date.";

        const matches = (staff || []).filter((member) =>
          member.name.toLowerCase().includes(staffQuery),
        );
        if (matches.length !== 1) return `I could not uniquely match ${staffQuery}. Please choose the staff member once manually.`;

        setSelectedStaffId(matches[0].id);
        setSelectedAttendanceDate(parsedDate);
        markAttendance(
          { staffId: matches[0].id, status, date: getISTDateKey(parsedDate) },
          {
            onSuccess: (attendance) => {
              setTodayPaymentInput(String(Number(attendance.payment || 0)));
              toast({ title: `Marked ${status}`, description: `${matches[0].name} updated for ${formatDate(parsedDate, "dd MMM yyyy")}.` });
            },
            onError: (error: Error) => {
              toast({ title: "Failed", description: error.message, variant: "destructive" });
            },
          },
        );
        return `Marking ${matches[0].name} as ${status}.`;
      },
    },
  ];

  return (
    <>
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Staff Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Create staff, track attendance, and manage payment summaries without affecting POS workflows.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard title="Total Staff" value={staff?.length ?? 0} icon={<Users className="w-5 h-5" />} />
        <MetricCard title="Overall Paid to Staff" value={formatCurrencyINR(totalPaidToAllStaff)} icon={<Wallet className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="space-y-6 lg:order-2">
          <div className="bg-card rounded-2xl border border-border p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">Add Staff</h2>
            </div>
            <Input
              placeholder="Staff name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              placeholder="Phone number"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={draft.salaryType}
                onChange={(e) => setDraft({ ...draft, salaryType: e.target.value as "daily" | "monthly" })}
              >
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
              </select>
              <Input
                type="number"
                min="0"
                placeholder={draft.salaryType === "daily" ? "Daily wage" : "Monthly salary"}
                value={draft.salaryAmount}
                onChange={(e) => setDraft({ ...draft, salaryAmount: e.target.value })}
              />
            </div>
            <Button onClick={handleCreateStaff} disabled={isCreating} className="w-full">
              {isCreating ? "Saving..." : "Create Staff"}
            </Button>
          </div>

          <div className="bg-card rounded-2xl border border-border p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="font-semibold">Staff List</h2>
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-20 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {orderedStaff.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setSelectedStaffId(member.id)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition-colors",
                      selectedStaffId === member.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-muted/20 hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-semibold">{member.name}</div>
                          {member.name.trim().toLowerCase() === PRIMARY_WORKER_NAME ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                              Primary Worker
                            </span>
                          ) : null}
                        </div>
                        <div className="text-sm text-muted-foreground">{member.phone}</div>
                        <div className="text-xs text-muted-foreground mt-1 capitalize">
                          {member.salaryType} salary: {formatCurrencyINR(Number(member.salaryAmount || 0))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-primary">{formatCurrencyINR(member.thisMonthPayable)}</div>
                        <div className="text-xs text-muted-foreground">Payable Now</div>
                        <div className="text-xs font-medium mt-1">{formatCurrencyINR(member.totalPayment)}</div>
                        <div className="text-[11px] text-muted-foreground">Total Paid</div>
                      </div>
                    </div>
                  </button>
                ))}
                {!staff?.length && (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No staff created yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6 lg:order-1">
          {detailsLoading ? (
            <Skeleton className="h-[520px] rounded-2xl" />
          ) : selectedStaff && details ? (
            <>
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-display font-bold">{selectedStaff.name}</h2>
                    <p className="text-sm text-muted-foreground">{selectedStaff.phone}</p>
                    <p className="text-sm text-muted-foreground mt-1 capitalize">
                      {selectedStaff.salaryType} salary: {formatCurrencyINR(Number(selectedStaff.salaryAmount || 0))}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 text-sm text-muted-foreground">
                    <div className="space-y-2">
                      <div>Attendance Date</div>
                      <Input
                        type="date"
                        value={selectedDateKey}
                        onChange={(e) => setSelectedAttendanceDate(new Date(`${e.target.value}T00:00:00`))}
                        className="min-w-[180px]"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Attendance Summary Range</h3>
                      <p className="text-sm text-muted-foreground">Showing present, absent, payable, and history for {attendanceRangeLabel}.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={attendanceRangeMode === "month" ? "default" : "outline"}
                        onClick={() => setAttendanceRangeMode("month")}
                      >
                        This Month
                      </Button>
                      <Button
                        type="button"
                        variant={attendanceRangeMode === "custom" ? "default" : "outline"}
                        onClick={() => setAttendanceRangeMode("custom")}
                      >
                        Custom Range
                      </Button>
                    </div>
                  </div>
                  {attendanceRangeMode === "custom" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">From</label>
                        <Input
                          type="date"
                          value={toDateInputString(customRangeStart)}
                          onChange={(e) => setCustomRangeStart(new Date(`${e.target.value}T00:00:00`))}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">To</label>
                        <Input
                          type="date"
                          value={toDateInputString(customRangeEnd)}
                          onChange={(e) => setCustomRangeEnd(new Date(`${e.target.value}T00:00:00`))}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <MetricCard
                    title={selectedStaff.salaryType === "monthly" ? "Monthly Salary" : "Daily Salary"}
                    value={formatCurrencyINR(Number(selectedStaff.salaryAmount || 0))}
                    subValue={selectedStaff.salaryType === "monthly" ? "Before leave deduction" : "Per present day"}
                    icon={<Wallet className="w-5 h-5" />}
                  />
                  <MetricCard title="Present Days" value={rangeSummary.presentDays} subValue={attendanceRangeLabel} icon={<CheckCircle2 className="w-5 h-5" />} />
                  <MetricCard title="Absent Days" value={rangeSummary.absentDays} subValue={attendanceRangeLabel} icon={<XCircle className="w-5 h-5" />} />
                  <MetricCard title="Salary Payable" value={formatCurrencyINR(rangeSummary.payable)} subValue={attendanceRangeLabel} icon={<Wallet className="w-5 h-5" />} />
                  <MetricCard title={`Paid for ${attendanceRangeLabel}`} value={formatCurrencyINR(rangePaidAmount)} icon={<Wallet className="w-5 h-5" />} />
                  <MetricCard title="Balance" value={formatCurrencyINR(rangeBalance)} subValue={rangeBalance > 0 ? "Still pending" : "Fully paid"} icon={<Wallet className="w-5 h-5" />} />
                  <MetricCard title={`Earned on ${formatDate(selectedAttendanceDate, "dd MMM")}`} value={formatCurrencyINR(selectedAttendancePayment)} icon={<CalendarDays className="w-5 h-5" />} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="font-semibold">Edit Daily Payment Mode or Range</h3>
                    <p className="text-sm text-muted-foreground">
                      Set the daily worker amount here. For example, enter 500 for a worker paid 500 per present day.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Payment Mode</label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={salaryTypeInput}
                          onChange={(e) => setSalaryTypeInput(e.target.value as "daily" | "monthly")}
                        >
                          <option value="daily">Daily</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          {salaryTypeInput === "daily" ? "Daily Payment" : "Monthly Salary"}
                        </label>
                        <Input
                          type="number"
                          min="0"
                          value={salaryAmountInput}
                          onChange={(e) => setSalaryAmountInput(e.target.value)}
                        />
                      </div>
                    </div>
                    {salaryTypeInput === "daily" && (
                      <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={applySalaryToRange}
                          onChange={(e) => setApplySalaryToRange(e.target.checked)}
                        />
                        <span>
                          Apply this daily payment to all present days in {attendanceRangeLabel}.
                        </span>
                      </label>
                    )}
                    <Button onClick={handleSaveStaffSalary} disabled={isUpdatingStaffSalary} className="w-full">
                      {isUpdatingStaffSalary ? "Saving..." : "Save Daily Payment Mode"}
                    </Button>
                  </div>

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="font-semibold">Mark Attendance</h3>
                    <p className="text-sm text-muted-foreground">
                      Date: <span className="font-medium">{selectedDateLabel}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Current status: <span className="font-medium capitalize">{selectedAttendance?.status || "not marked"}</span>
                    </p>
                    {selectedStaff.salaryType === "daily" && (
                      <p className="text-sm text-muted-foreground">
                        Daily wage: <span className="font-medium text-foreground">{formatCurrencyINR(Number(selectedStaff.salaryAmount || 0))}</span>
                      </p>
                    )}
                    {selectedStaff.salaryType === "monthly" && (
                      <p className="text-sm text-muted-foreground">
                        Present day value: <span className="font-medium text-foreground">{formatCurrencyINR(Number(selectedStaff.salaryAmount || 0) / 30)}</span>
                      </p>
                    )}
                    <div className="flex gap-3">
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleMarkAttendance("present")}
                        disabled={isMarking}
                      >
                        Present
                      </Button>
                      <Button
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => handleMarkAttendance("absent")}
                        disabled={isMarking}
                      >
                        Absent
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="font-semibold">
                      {selectedStaff.salaryType === "monthly" ? "Selected Date Value" : "Edit Selected Date Payment"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Daily staff use this as actual daily payment. Monthly staff are calculated from attendance: present adds one day value, absent adds zero.
                    </p>
                    <Input
                      type="number"
                      min="0"
                      value={todayPaymentInput}
                      onChange={(e) => setTodayPaymentInput(e.target.value)}
                      readOnly={selectedStaff.salaryType === "monthly"}
                      className={selectedStaff.salaryType === "monthly" ? "bg-muted/30" : undefined}
                    />
                    <Button
                      onClick={handleSaveTodayPayment}
                      disabled={isUpdatingTodayPayment || selectedStaff.salaryType === "monthly"}
                      className="w-full"
                    >
                      {isUpdatingTodayPayment ? "Saving..." : "Save Selected Date Payment"}
                    </Button>
                  </div>

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="font-semibold">Salary Settlement</h3>
                    <p className="text-sm text-muted-foreground">
                      Enter the amount paid for {attendanceRangeLabel}. For April example: salary payable 14000, paid 14000, balance 0.
                    </p>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Salary Payable</label>
                      <Input value={formatCurrencyINR(rangeSummary.payable)} readOnly className="bg-muted/30" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Paid for {attendanceRangeLabel}</label>
                      <Input
                        type="number"
                        min="0"
                        value={rangePaidInput}
                        onChange={(e) => setRangePaidInput(e.target.value)}
                      />
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Balance</span>
                        <span className={cn("font-mono font-bold", rangeBalance > 0 ? "text-red-600" : "text-green-600")}>
                          {formatCurrencyINR(Math.max(0, rangeSummary.payable - Number(rangePaidInput || 0)))}
                        </span>
                      </div>
                    </div>
                    <Button onClick={handleSaveRangePayment} disabled={isUpdatingSalaryPayment} className="w-full">
                      {isUpdatingSalaryPayment ? "Saving..." : "Save Salary Payment"}
                    </Button>
                  </div>

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="font-semibold">Legacy Total Paid</h3>
                    <p className="text-sm text-muted-foreground">
                      Use this only for old records before month-wise salary payment was added.
                    </p>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Legacy Total Amount Paid</label>
                      <Input value={formatCurrencyINR(details.summary.totalPayment)} readOnly className="bg-muted/30" />
                    </div>
                    <Input
                      type="number"
                      min="0"
                      value={overallPaymentInput}
                      onChange={(e) => setOverallPaymentInput(e.target.value)}
                    />
                    <Button onClick={handleSaveOverallPayment} disabled={isUpdatingOverallPayment} className="w-full">
                      {isUpdatingOverallPayment ? "Saving..." : "Save Legacy Total"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">Attendance History</h3>
                    <p className="text-sm text-muted-foreground">Date-wise attendance and payment records for {attendanceRangeLabel}.</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-3 pr-4">Date</th>
                        <th className="py-3 pr-4">Status</th>
                        <th className="py-3 pr-4 text-right">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {rangeAttendance.map((entry) => (
                        <tr key={entry.id}>
                          <td className="py-3 pr-4">{formatDate(entry.date, "dd MMM yyyy")}</td>
                          <td className="py-3 pr-4 capitalize">{entry.status}</td>
                          <td className="py-3 pr-4 text-right font-mono">{formatCurrencyINR(getStaffAttendancePayment(selectedStaff, entry))}</td>
                        </tr>
                      ))}
                      {rangeAttendance.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-muted-foreground">
                            No attendance records for {attendanceRangeLabel}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-card rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              Select a staff member to manage attendance and payments.
            </div>
          )}
        </div>
      </div>
    </div>
      <VoiceAssistant
        title="Staff Voice Helper"
        subtitle="Mark attendance by voice with staff name and date."
        commands={staffVoiceCommands}
      />
    </>
  );
}
