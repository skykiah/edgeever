import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Link2, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, getConfiguredDesktopApiBaseUrl } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";

const getPublicShareUrl = (token: string) => {
  const baseUrl = getConfiguredDesktopApiBaseUrl() || window.location.origin;
  return `${baseUrl.replace(/\/$/, "")}/share/${encodeURIComponent(token)}`;
};

export const ShareMemoDialog = ({
  memoId,
  open,
  onOpenChange,
}: {
  memoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copyResetTimerRef = useRef<number | null>(null);
  const queryKey = ["memo-share", memoId] as const;
  const shareQuery = useQuery({
    queryKey,
    queryFn: () => api.getMemoShare(memoId),
    enabled: open,
    retry: false,
  });
  const createMutation = useMutation({
    mutationFn: () => api.createMemoShare(memoId),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });
  const revokeMutation = useMutation({
    mutationFn: () => api.revokeMemoShare(memoId),
    onSuccess: () => queryClient.setQueryData(queryKey, { share: null }),
  });
  useEffect(() => {
    createMutation.reset();
    revokeMutation.reset();
    setCopyState("idle");
  }, [memoId]);
  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
  }, []);

  const share = shareQuery.data?.share ?? null;
  const shareUrl = share ? getPublicShareUrl(share.token) : "";
  const isWorking = shareQuery.isLoading || createMutation.isPending || revokeMutation.isPending;
  const error = shareQuery.error || createMutation.error || revokeMutation.error;

  const copyLink = async () => {
    const copied = await copyTextToClipboard(shareUrl);
    setCopyState(copied ? "copied" : "error");
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyResetTimerRef.current = null;
    }, 3000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-5 py-5 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-5 w-5 text-emerald-600" />
            {t("sharing.title")}
          </DialogTitle>
          <DialogDescription className="pt-1 leading-5">{t("sharing.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5">
          {shareQuery.isLoading ? (
            <div className="flex min-h-20 items-center justify-center text-slate-500" role="status">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </div>
          ) : share ? (
            <>
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly aria-label={t("sharing.linkLabel")} className="min-w-0 font-mono text-xs" />
                <Button
                  variant={copyState === "copied" ? "solid" : copyState === "error" ? "danger" : "outline"}
                  className="min-w-28"
                  aria-live="polite"
                  onClick={() => void copyLink()}
                >
                  {copyState === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {t(copyState === "copied" ? "sharing.copied" : copyState === "error" ? "sharing.copyFailed" : "sharing.copy")}
                </Button>
              </div>
              <p className="text-xs leading-5 text-slate-500">{t("sharing.liveContentHint")}</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button variant="danger" disabled={isWorking} onClick={() => revokeMutation.mutate()}>
                  <Trash2 className="h-4 w-4" />
                  {t("sharing.revoke")}
                </Button>
                <Button variant="solid" onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="h-4 w-4" />
                  {t("sharing.open")}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-6 text-slate-600">{t("sharing.inactiveHint")}</p>
              <Button className="w-full" variant="solid" disabled={isWorking} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {t("sharing.create")}
              </Button>
            </div>
          )}
          {error ? <p className="text-sm text-rose-600" role="alert">{t("sharing.error")}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
