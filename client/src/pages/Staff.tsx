import { useEffect, useMemo, useState } from "react";
import {
  useCreateStaff,
  useMarkStaffAttendance,
  useStaff,
  useStaffDetails,
  useUpdateStaffOverallPayment,
  useUpdateStaffTodayPayment,
} from "@/hooks/use-pos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/MetricCard";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyINR, formatDate, toDateInputString } from "@/lib/format";
import { CalendarDays, CheckCircle2, UserPlus, Users, Wallet, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getISTDateKey } from "@shared/timezone";

type StaffDraft = {
  name: string;
  phone: string;
  salaryType: "daily" | "monthly";
  salaryAmount: string;
};

const defaultDraft: StaffDraft = {
  name: "",
  phone: "",
  salaryType: "daily",
  salaryAmount: "",
};

export default function Staff() {
  const { toast } = useToast();
  const { data: staff, isLoading } = useStaff();
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const { data: details, isLoading: detailsLoading } = useStaffDetails(selectedStaffId);
  const { mutate: createStaff, isPending: isCreating } = useCreateStaff();
  const { mutate: markAttendance, isPending: isMarking } = useMarkStaffAttendance();
  const { mutate: updateTodayPayment, isPending: isUpdatingTodayPayment } = useUpdateStaffTodayPayment();
  const { mutate: updateOverallPayment, isPending: isUpdatingOverallPayment } = useUpdateStaffOverallPayment();

  const [draft, setDraft] = useState<StaffDraft>(defaultDraft);
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState<Date>(new Date());
  const [todayPaymentInput, setTodayPaymentInput] = useState("");
  const [overallPaymentInput, setOverallPaymentInput] = useState("");
  const totalPaidToAllStaff = useMemo(
    () => (staff ?? []).reduce((sum, member) => sum + Number(member.totalPayment || 0), 0),
    [staff],
  );

  useEffect(() => {
    if (!selectedStaffId && staff?.length) {
      setSelectedStaffId(staff[0].id);
    }
  }, [staff, selectedStaffId]);

  useEffect(() => {
    if (details) {
      setOverallPaymentInput(String(Number(details.summary.totalPayment || 0)));
    }
  }, [details]);

  const selectedStaff = details?.staff;
  const selectedDateKey = useMemo(() => getISTDateKey(selectedAttendanceDate), [selectedAttendanceDate]);
  const selectedDateLabel = useMemo(() => formatDate(selectedAttendanceDate, "dd MMM yyyy"), [selectedAttendanceDate]);
  const selectedAttendance = useMemo(() => {
    return details?.attendance.find((entry) => (entry.date ? getISTDateKey(entry.date) : "") === selectedDateKey) || null;
  }, [details?.attendance, selectedDateKey]);

  useEffect(() => {
    setTodayPaymentInput(String(Number(selectedAttendance?.payment || 0)));
  }, [selectedAttendance]);

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

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8 space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Staff Management</h1>
        <p className="text-muted-foreground mt-1">Create staff, track attendance, and manage payment summaries without affecting POS workflows.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard title="Total Staff" value={staff?.length ?? 0} icon={<Users className="w-5 h-5" />} />
        <MetricCard title="Overall Paid to Staff" value={formatCurrencyINR(totalPaidToAllStaff)} icon={<Wallet className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <div className="space-y-6">
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
                {staff?.map((member) => (
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
                        <div className="font-semibold">{member.name}</div>
                        <div className="text-sm text-muted-foreground">{member.phone}</div>
                        <div className="text-xs text-muted-foreground mt-1 capitalize">
                          {member.salaryType} salary: {formatCurrencyINR(Number(member.salaryAmount || 0))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{formatCurrencyINR(member.totalPayment)}</div>
                        <div className="text-xs text-muted-foreground">Total Payment</div>
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

        <div className="space-y-6">
          {detailsLoading ? (
            <Skeleton className="h-[520px] rounded-2xl" />
          ) : selectedStaff && details ? (
            <>
              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-display font-bold">{selectedStaff.name}</h2>
                    <p className="text-muted-foreground">{selectedStaff.phone}</p>
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

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <MetricCard title="Present Days" value={details.summary.presentDays} icon={<CheckCircle2 className="w-5 h-5" />} />
                  <MetricCard title="Absent Days" value={details.summary.absentDays} icon={<XCircle className="w-5 h-5" />} />
                  <MetricCard title={`Payment on ${formatDate(selectedAttendanceDate, "dd MMM")}`} value={formatCurrencyINR(Number(selectedAttendance?.payment || 0))} icon={<CalendarDays className="w-5 h-5" />} />
                  <MetricCard title="Total Paid" value={formatCurrencyINR(details.summary.totalPayment)} icon={<Wallet className="w-5 h-5" />} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="font-semibold">Mark Attendance</h3>
                    <p className="text-sm text-muted-foreground">
                      Date: <span className="font-medium">{selectedDateLabel}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Current status: <span className="font-medium capitalize">{selectedAttendance?.status || "not marked"}</span>
                    </p>
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
                    <h3 className="font-semibold">Edit Selected Date Payment</h3>
                    <p className="text-sm text-muted-foreground">
                      Daily staff auto-fill from daily wage when marked present. Editing payment only updates the existing record for {selectedDateLabel}.
                    </p>
                    <Input
                      type="number"
                      min="0"
                      value={todayPaymentInput}
                      onChange={(e) => setTodayPaymentInput(e.target.value)}
                    />
                    <Button onClick={handleSaveTodayPayment} disabled={isUpdatingTodayPayment} className="w-full">
                      {isUpdatingTodayPayment ? "Saving..." : "Save Selected Date Payment"}
                    </Button>
                  </div>

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <h3 className="font-semibold">Edit Overall Payment</h3>
                    <p className="text-sm text-muted-foreground">
                      Set the total payment you want to track overall. The system stores only the adjustment, so attendance logic stays intact.
                    </p>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Total Amount Paid to Staff</label>
                      <Input value={formatCurrencyINR(details.summary.totalPayment)} readOnly className="bg-muted/30" />
                    </div>
                    <Input
                      type="number"
                      min="0"
                      value={overallPaymentInput}
                      onChange={(e) => setOverallPaymentInput(e.target.value)}
                    />
                    <Button onClick={handleSaveOverallPayment} disabled={isUpdatingOverallPayment} className="w-full">
                      {isUpdatingOverallPayment ? "Saving..." : "Save Overall Payment"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">Attendance History</h3>
                    <p className="text-sm text-muted-foreground">Date-wise attendance and payment records for this staff member.</p>
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
                      {details.attendance.map((entry) => (
                        <tr key={entry.id}>
                          <td className="py-3 pr-4">{formatDate(entry.date, "dd MMM yyyy")}</td>
                          <td className="py-3 pr-4 capitalize">{entry.status}</td>
                          <td className="py-3 pr-4 text-right font-mono">{formatCurrencyINR(Number(entry.payment || 0))}</td>
                        </tr>
                      ))}
                      {details.attendance.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-muted-foreground">
                            No attendance records yet.
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
  );
}
