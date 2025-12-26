import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, MoreHorizontal, FileText, AlertCircle, EyeOff, Lock, Clock } from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// Mock Data
const initialUsers = [
  { id: "1", name: "Eleanor Rigby", room: "101", status: "Active", risk: "High", image: "https://i.pravatar.cc/150?u=eleanor", lastUpdated: new Date(Date.now() - 25 * 60 * 60 * 1000) }, // > 24h ago
  { id: "2", name: "Robert Smith", room: "102", status: "Active", risk: "Medium", image: "https://i.pravatar.cc/150?u=robert", lastUpdated: new Date() },
  { id: "3", name: "Mary Williams", room: "104", status: "Active", risk: "Low", image: "https://i.pravatar.cc/150?u=mary", lastUpdated: new Date() },
  { id: "4", name: "John Doe", room: "105", status: "Temporary", risk: "High", image: "https://i.pravatar.cc/150?u=john", lastUpdated: new Date(Date.now() - 48 * 60 * 60 * 1000) }, // > 24h ago
];

export default function ServiceUsers() {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [simulateTimeDecay, setSimulateTimeDecay] = useState(true); // Default to true to show feature
  const [lockedUser, setLockedUser] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState("");

  // New user form state
  const [newUser, setNewUser] = useState({ name: "", room: "", risk: "Medium" });

  // Redaction & DELETION Logic
  const getDisplayData = (user: typeof initialUsers[0]) => {
    // If simulation is on AND record is older than 24 hours
    const isOld = (Date.now() - user.lastUpdated.getTime()) > (24 * 60 * 60 * 1000);
    
    if (simulateTimeDecay && isOld) {
      // SIMULATE DELETION: In a real backend, we would return NULL for these fields.
      // Here we strip them from the display object completely to prove they are gone from this view.
      
      const initials = user.name.split(' ').map(n => n[0]).join('. ') + '.';
      
      // We explicitly return an object MISSING the original PII to simulate it being dropped from the query
      return {
        id: user.id,
        // name: DELETED
        // room: DELETED
        // image: DELETED
        displayName: initials,
        displayRoom: "•••", 
        risk: user.risk,
        isRedacted: true,
        isDeleted: true // Flag to show it's actually purged
      };
    }
    return {
      ...user,
      displayName: user.name,
      displayRoom: user.room,
      isRedacted: false,
      isDeleted: false
    };
  };

  const filteredUsers = users.map(getDisplayData).filter(user => {
     // Search needs to handle deleted data - can't search by name if name is deleted!
     if (user.isDeleted) return true; // Show deleted records as placeholders
     return user.displayName.toLowerCase().includes(search.toLowerCase()) || user.displayRoom.includes(search);
  });

  const handleAddUser = () => {
    const user = {
      id: Math.random().toString(36).substr(2, 9),
      name: newUser.name,
      room: newUser.room,
      status: "Active",
      risk: newUser.risk,
      image: `https://i.pravatar.cc/150?u=${newUser.name}`,
      lastUpdated: new Date()
    };
    setUsers([...users, user]);
    setIsDialogOpen(false);
    setNewUser({ name: "", room: "", risk: "Medium" });
    toast({
      title: "Profile Created",
      description: `${user.name} has been added to the registry.`,
    });
  };

  const handleUnlock = () => {
    if (passwordInput === "admin") {
      toast({ title: "Access Granted", description: "Record unsealed for 15 minutes." });
      setLockedUser(null);
      setPasswordInput("");
    } else {
      toast({ title: "Access Denied", description: "Incorrect password.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative">
       {/* Security Simulation Controls */}
       <div className="absolute top-0 right-0 z-10">
         <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 rounded-full border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-400">
            <Clock size={14} />
            <span className="font-medium">Security Simulation:</span>
            <button 
              onClick={() => setSimulateTimeDecay(!simulateTimeDecay)}
              className={`px-2 py-0.5 rounded ${simulateTimeDecay ? 'bg-amber-200 dark:bg-amber-800 text-amber-900' : 'bg-transparent hover:underline'}`}
            >
              {simulateTimeDecay ? "Active (>24h Redacted)" : "Disabled (Show All)"}
            </button>
         </div>
       </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-8">
        <div>
          <h2 className="text-3xl font-heading font-bold text-foreground">Service Users</h2>
          <p className="text-muted-foreground">Manage resident profiles and access individual care records.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={18} /> Add Resident
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Resident Profile</DialogTitle>
              <DialogDescription>
                Add a new service user to the system. Basic details are required to start a care plan.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Name</Label>
                <Input id="name" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="room" className="text-right">Room No.</Label>
                <Input id="room" value={newUser.room} onChange={e => setNewUser({...newUser, room: e.target.value})} className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddUser}>Create Profile</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <Search className="text-muted-foreground" size={20} />
        <Input 
          placeholder="Search by name or room number..." 
          className="border-none shadow-none focus-visible:ring-0 bg-transparent text-lg"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.map((user) => (
          <div key={user.id} onClick={() => user.isRedacted && setLockedUser(user.id)} className="block group cursor-pointer">
            <Card className={`h-full transition-all duration-200 hover:shadow-md hover:border-primary/50 relative overflow-hidden ${user.isRedacted ? "bg-muted/10" : ""}`}>
              {user.isRedacted && (
                <div className="absolute top-2 right-2 z-10">
                   <Badge variant="outline" className="bg-background/80 backdrop-blur-sm gap-1 border-amber-200 text-amber-700">
                     <EyeOff size={10} /> Redacted
                   </Badge>
                </div>
              )}
              
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                    {user.isRedacted ? (
                       <div className="h-full w-full bg-muted flex items-center justify-center">
                         <Lock size={16} className="text-muted-foreground" />
                       </div>
                    ) : (
                      <>
                        <AvatarImage src={(user as any).image} />
                        <AvatarFallback>{user.displayName.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  <div>
                    <CardTitle className={`text-base transition-colors ${user.isRedacted ? "font-mono text-muted-foreground" : "group-hover:text-primary"}`}>
                      {user.displayName}
                    </CardTitle>
                    <CardDescription>Room {user.displayRoom}</CardDescription>
                  </div>
                </div>
                {!user.isRedacted && (
                  <Badge variant={user.risk === 'High' ? 'destructive' : 'secondary'} className="ml-auto">
                    {user.risk} Risk
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex justify-between text-sm text-muted-foreground mb-4">
                  {user.isRedacted ? (
                    <span className="flex items-center gap-1 italic"><Lock size={14}/> Record Sealed</span>
                  ) : (
                    <>
                      <span className="flex items-center gap-1"><FileText size={14}/> Care Plan Active</span>
                      <span className="flex items-center gap-1"><AlertCircle size={14}/> 2 Alerts</span>
                    </>
                  )}
                </div>
                {user.isRedacted ? (
                  <div className="w-full h-1.5 rounded-full bg-muted"></div>
                ) : (
                  <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 w-[85%]"></div>
                  </div>
                )}
                {!user.isRedacted && <p className="text-xs text-right text-muted-foreground mt-1">85% Compliant</p>}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      {/* Security Check Dialog */}
      <Dialog open={!!lockedUser} onOpenChange={(open) => !open && setLockedUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Lock size={20} /> Restricted Access
            </DialogTitle>
            <DialogDescription>
              This record has been sealed for privacy (older than 24 hours). Please enter your secure credentials to unseal and view PII.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="password">Security Password</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              />
              <p className="text-xs text-muted-foreground">Hint: Use "admin"</p>
            </div>
          </div>
          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="secondary" onClick={() => setLockedUser(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleUnlock}>
              Unseal Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}