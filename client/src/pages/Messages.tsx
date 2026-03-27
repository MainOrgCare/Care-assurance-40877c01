import { useState, useEffect, useCallback } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft, 
  Mail, 
  MailOpen, 
  Trash2, 
  Archive, 
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Inbox,
  RefreshCw,
  Send,
  PenSquare,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { useAuth } from "@/context/AuthContext";

interface Message {
  id: string;
  recipientId: string;
  senderId: string | null;
  senderName: string;
  subject: string;
  message: string;
  isRead: boolean;
  isArchived: boolean;
  priority: "normal" | "high" | "urgent";
  readAt: string | null;
  createdAt: string;
}

interface UserForRecipient {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
}

export default function Messages() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  usePageTitle("Messages");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composeForm, setComposeForm] = useState({
    recipientId: "",
    subject: "",
    message: "",
    priority: "normal" as "normal" | "high" | "urgent",
  });

  // Fetch users for recipient picker
  const { data: allUsers = [] } = useQuery<UserForRecipient[]>({
    queryKey: queryKeys.users.all(),
  });
  const availableRecipients = allUsers.filter((u: UserForRecipient) => u.status === "active" && u.id !== user?.id);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages?includeArchived=${showArchived}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch messages: ${res.status}`);
      }
      const data = await res.json();
      setMessages(data);
    } catch (error) {
      console.error("Failed to fetch messages:", error);
      toast({ title: "Error", description: "Failed to load messages", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [showArchived, toast]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleSelectMessage = async (message: Message) => {
    setSelectedMessage(message);
    
    // Mark as read if not already
    if (!message.isRead) {
      try {
        await apiRequest("PATCH", `/api/messages/${message.id}/read`);
        setMessages(prev => prev.map(m => 
          m.id === message.id ? { ...m, isRead: true } : m
        ));
        setSelectedMessage(prev => prev ? { ...prev, isRead: true } : prev);
      } catch (error) {
        console.error("Failed to mark message as read:", error);
        toast({ title: "Warning", description: "Could not mark message as read", variant: "destructive" });
      }
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await apiRequest("PATCH", `/api/messages/${id}/archive`);
      toast({ title: "Archived", description: "Message has been archived" });
      setMessages(prev => prev.filter(m => m.id !== id));
      if (selectedMessage?.id === id) {
        setSelectedMessage(null);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to archive message", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/messages/${id}`);
      toast({ title: "Deleted", description: "Message has been deleted" });
      setMessages(prev => prev.filter(m => m.id !== id));
      if (selectedMessage?.id === id) {
        setSelectedMessage(null);
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete message", variant: "destructive" });
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "high":
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      default:
        return null;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <Badge variant="destructive" className="text-xs">Urgent</Badge>;
      case "high":
        return <Badge variant="warning" className="text-xs">High</Badge>;
      default:
        return null;
    }
  };

  const unreadCount = messages.filter(m => !m.isRead).length;

  const handleSendMessage = async () => {
    if (!composeForm.recipientId || !composeForm.subject.trim() || !composeForm.message.trim()) return;
    setComposing(true);
    try {
      await apiRequest("POST", "/api/messages/send", composeForm);
      toast({ title: "Sent", description: "Message has been sent successfully." });
      setComposeOpen(false);
      setComposeForm({ recipientId: "", subject: "", message: "", priority: "normal" });
      fetchMessages();
    } catch (error) {
      toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
    } finally {
      setComposing(false);
    }
  };

  return (
    <div className="page-shell page-shell-compact">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => setLocation("/dashboard")} aria-label="Back to dashboard" className="mt-0.5 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-8 w-8 rounded-lg bg-primary/6 border border-primary/12 flex items-center justify-center shrink-0">
            <Inbox className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="page-title">
                Messages
              </h2>
              {unreadCount > 0 && (
                <Badge variant="success" className="text-[10px]">
                  {unreadCount} unread
                </Badge>
              )}
            </div>
            <p className="page-subtitle mt-1">System notifications and Compli-ee communications.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <PenSquare className="h-4 w-4" />
                Compose
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Message</DialogTitle>
                <DialogDescription>Send a message to a team member.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label id="compose-to-label" className="text-xs font-medium text-muted-foreground mb-1 block">To *</label>
                  <Select value={composeForm.recipientId} onValueChange={(v) => setComposeForm({ ...composeForm, recipientId: v })}>
                    <SelectTrigger aria-labelledby="compose-to-label" aria-required="true"><SelectValue placeholder="Select recipient..." /></SelectTrigger>
                    <SelectContent>
                      {availableRecipients.map((u: UserForRecipient) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-[1fr_140px] gap-2">
                  <div>
                    <label htmlFor="compose-subject" className="text-xs font-medium text-muted-foreground mb-1 block">Subject *</label>
                    <Input
                      id="compose-subject"
                      value={composeForm.subject}
                      onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                      placeholder="Message subject..."
                      maxLength={200}
                      aria-required="true"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
                    <Select value={composeForm.priority} onValueChange={(v: "normal" | "high" | "urgent") => setComposeForm({ ...composeForm, priority: v })}>
                      <SelectTrigger aria-label="Message priority"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label htmlFor="compose-message" className="text-xs font-medium text-muted-foreground mb-1 block">Message *</label>
                  <Textarea
                    id="compose-message"
                    value={composeForm.message}
                    onChange={(e) => setComposeForm({ ...composeForm, message: e.target.value })}
                    placeholder="Type your message..."
                    rows={6}
                    maxLength={5000}
                    aria-required="true"
                  />
                  <p className="text-[10px] text-muted-foreground text-right mt-0.5">{composeForm.message.length}/5000</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={(!composeForm.recipientId || !composeForm.subject.trim() || !composeForm.message.trim()) && !composing ? 0 : -1}>
                        <Button
                          onClick={handleSendMessage}
                          disabled={!composeForm.recipientId || !composeForm.subject.trim() || !composeForm.message.trim() || composing}
                          className="gap-1.5"
                        >
                          {composing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Send
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {(!composeForm.recipientId || !composeForm.subject.trim() || !composeForm.message.trim()) && !composing && (
                      <TooltipContent>
                        <p>Please fill in all required fields (To, Subject, Message)</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={fetchMessages} disabled={loading} aria-label="Refresh messages">
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)} className="transition-all duration-200">
            <Archive className="h-4 w-4 mr-2" />
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr] min-h-0">
        <Card className="app-surface overflow-hidden" data-testid="messages-list">
          <CardHeader className="py-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-primary/8 flex items-center justify-center">
                <Mail className="h-3 w-3 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xs font-semibold">Inbox</CardTitle>
                <CardDescription className="text-[10px]">
                  {messages.length} message{messages.length !== 1 ? "s" : ""}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <ScrollArea className="h-[clamp(380px,62vh,760px)]">
            {loading ? (
              <div className="divide-y divide-border/55">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="p-4 flex items-start gap-3">
                    <Skeleton className="h-4 w-4 mt-1 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3.5 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <div className="h-12 w-12 mx-auto mb-3 rounded-xl bg-muted/30 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-semibold text-foreground/70">Inbox empty</p>
                <p className="text-[10px] mt-1 text-muted-foreground max-w-[200px] mx-auto">No messages yet. New messages from your team will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/55">
                {messages.map((message) => (
                  <button
                    key={message.id}
                    onClick={() => handleSelectMessage(message)}
                    className={cn(
                      "w-full text-left p-4 transition-all hover:bg-muted/50",
                      selectedMessage?.id === message.id && "bg-primary/8",
                      !message.isRead && "bg-success/[0.05]"
                    )}
                    data-testid={`message-item-${message.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {message.isRead ? (
                          <MailOpen className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Mail className="h-4 w-4 text-success" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className={cn("truncate text-sm font-medium", !message.isRead && "font-semibold")}>
                            {message.senderName}
                          </span>
                          {getPriorityIcon(message.priority)}
                        </div>
                        <p className={cn("truncate text-sm", !message.isRead ? "text-foreground" : "text-muted-foreground")}>
                          {message.subject}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(message.createdAt), "MMM d, h:mm a")}
                          </span>
                          {message.isArchived && (
                            <Badge variant="outline" className="text-[10px] py-0">
                              Archived
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        <Card className="app-surface overflow-hidden" data-testid="messages-detail">
          {selectedMessage ? (
            <>
              <CardHeader className="py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{selectedMessage.subject}</CardTitle>
                      {getPriorityBadge(selectedMessage.priority)}
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-2">
                      <span>From: {selectedMessage.senderName}</span>
                      <span>•</span>
                      <span>{format(new Date(selectedMessage.createdAt), "MMMM d, yyyy 'at' h:mm a")}</span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {!selectedMessage.isArchived && (
                      <Button variant="outline" size="sm" onClick={() => handleArchive(selectedMessage.id)}>
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(selectedMessage.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/8 hover:border-destructive/30 dark:hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="py-6">
                <div className="max-w-none whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {selectedMessage.message}
                </div>
                {selectedMessage.isRead && selectedMessage.readAt && (
                  <div className="mt-6 border-t border-border/60 pt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Read on {format(new Date(selectedMessage.readAt), "MMMM d, yyyy 'at' h:mm a")}
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <div className="flex h-[clamp(380px,62vh,760px)] items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="h-12 w-12 mx-auto mb-3 rounded-xl bg-muted/25 flex items-center justify-center">
                  <Inbox className="h-5 w-5 text-muted-foreground/25" />
                </div>
                <p className="text-sm font-semibold text-foreground/70">No message selected</p>
                <p className="text-[10px] mt-1 text-muted-foreground">Choose a message from the inbox to view details</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
