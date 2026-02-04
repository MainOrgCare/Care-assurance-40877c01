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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Inbox className="h-6 w-6 text-emerald-500" />
              Messages
              {unreadCount > 0 && (
                <Badge variant="default" className="bg-emerald-500 ml-2">
                  {unreadCount} unread
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground">Messages from Compli-ee and system notifications</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMessages}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="h-4 w-4 mr-2" />
            {showArchived ? "Hide Archived" : "Show Archived"}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Message List */}
        <Card className="lg:col-span-1">
          <CardHeader className="py-4">
            <CardTitle className="text-lg">Inbox</CardTitle>
            <CardDescription>
              {messages.length} message{messages.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <Separator />
          <ScrollArea className="h-[500px]">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p>No messages yet</p>
                <p className="text-sm mt-1">
                  Ask Compli-ee to send you a message!
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {messages.map((message) => (
                  <button
                    key={message.id}
                    onClick={() => handleSelectMessage(message)}
                    className={cn(
                      "w-full text-left p-4 hover:bg-muted/50 transition-colors",
                      selectedMessage?.id === message.id && "bg-muted",
                      !message.isRead && "bg-emerald-50 dark:bg-emerald-950/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {message.isRead ? (
                          <MailOpen className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Mail className="h-4 w-4 text-emerald-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "font-medium text-sm truncate",
                            !message.isRead && "font-semibold"
                          )}>
                            {message.senderName}
                          </span>
                          {getPriorityIcon(message.priority)}
                        </div>
                        <p className={cn(
                          "text-sm truncate",
                          !message.isRead ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {message.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(message.createdAt), "MMM d, h:mm a")}
                          </span>
                          {message.isArchived && (
                            <Badge variant="outline" className="text-xs py-0">Archived</Badge>
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

        {/* Message Detail */}
        <Card className="lg:col-span-2">
          {selectedMessage ? (
            <>
              <CardHeader className="py-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{selectedMessage.subject}</CardTitle>
                      {getPriorityBadge(selectedMessage.priority)}
                    </div>
                    <CardDescription className="flex items-center gap-2">
                      <span>From: {selectedMessage.senderName}</span>
                      <span>•</span>
                      <span>{format(new Date(selectedMessage.createdAt), "MMMM d, yyyy 'at' h:mm a")}</span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {!selectedMessage.isArchived && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleArchive(selectedMessage.id)}
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(selectedMessage.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="py-6">
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                  {selectedMessage.message}
                </div>
                {selectedMessage.isRead && selectedMessage.readAt && (
                  <div className="mt-6 pt-4 border-t flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Read on {format(new Date(selectedMessage.readAt), "MMMM d, yyyy 'at' h:mm a")}
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-[500px] text-muted-foreground">
              <div className="text-center">
                <Mail className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p>Select a message to read</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
