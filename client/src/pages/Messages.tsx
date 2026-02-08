import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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

export default function Messages() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/messages?includeArchived=${showArchived}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
      toast({ title: "Error", description: "Failed to load messages", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [showArchived]);

  const handleSelectMessage = async (message: Message) => {
    setSelectedMessage(message);
    
    // Mark as read if not already
    if (!message.isRead) {
      try {
        const res = await fetch(`/api/messages/${message.id}/read`, {
          method: "PATCH",
          credentials: "include",
        });
        if (res.ok) {
          setMessages(prev => prev.map(m => 
            m.id === message.id ? { ...m, isRead: true } : m
          ));
          setSelectedMessage(prev => prev ? { ...prev, isRead: true } : prev);
        }
      } catch (error) {
        console.error("Failed to mark message as read:", error);
      }
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/messages/${id}/archive`, {
        method: "PATCH",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Archived", description: "Message has been archived" });
        setMessages(prev => prev.filter(m => m.id !== id));
        if (selectedMessage?.id === id) {
          setSelectedMessage(null);
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to archive message", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Deleted", description: "Message has been deleted" });
        setMessages(prev => prev.filter(m => m.id !== id));
        if (selectedMessage?.id === id) {
          setSelectedMessage(null);
        }
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete message", variant: "destructive" });
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "high":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default:
        return null;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <Badge variant="destructive" className="text-xs">Urgent</Badge>;
      case "high":
        return <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">High</Badge>;
      default:
        return null;
    }
  };

  const unreadCount = messages.filter(m => !m.isRead).length;

  return (
    <div className="page-shell">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => setLocation("/dashboard")} className="mt-0.5 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-10 w-10 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center shrink-0">
            <Inbox className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="page-title text-2xl sm:text-3xl">
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
          <Button variant="outline" size="sm" onClick={fetchMessages} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(!showArchived)}>
            <Archive className="h-4 w-4 mr-2" />
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr] min-h-0">
        <Card className="overflow-hidden" data-testid="messages-list">
          <CardHeader className="py-4">
            <CardTitle className="text-lg">Inbox</CardTitle>
            <CardDescription>
              {messages.length} message{messages.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <Separator />
          <ScrollArea className="h-[clamp(380px,62vh,760px)]">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-3 text-muted-foreground/25" />
                <p className="text-sm font-medium">No messages yet</p>
                <p className="text-xs mt-1 text-muted-foreground/60">Ask Compli-ee to send you a message.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/55">
                {messages.map((message) => (
                  <button
                    key={message.id}
                    onClick={() => handleSelectMessage(message)}
                    className={cn(
                      "w-full text-left p-4 transition-all hover:bg-muted/45",
                      selectedMessage?.id === message.id && "bg-primary/8",
                      !message.isRead && "bg-emerald-500/8"
                    )}
                    data-testid={`message-item-${message.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {message.isRead ? (
                          <MailOpen className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Mail className="h-4 w-4 text-emerald-600" />
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

        <Card className="overflow-hidden" data-testid="messages-detail">
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
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
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
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Read on {format(new Date(selectedMessage.readAt), "MMMM d, yyyy 'at' h:mm a")}
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <div className="flex h-[clamp(380px,62vh,760px)] items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Mail className="h-8 w-8 mx-auto mb-3 text-muted-foreground/20" />
                <p className="text-sm font-medium">Select a message to read</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
