'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getProjects, getZonesByProject, createEscalation } from '@/lib/firestore-utils';
import { Project, Zone, EscalationLevel } from '@/lib/types';
import { RAGCounters } from '@/components/rag-counters';
import { ZoneTable } from '@/components/zone-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/lib/firebase';

export default function AdminDashboard() {
  const router = useRouter();
  const { userData, loading: authLoading, signOut } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const [showEscalateDialog, setShowEscalateDialog] = useState(false);
  const [escalatingZone, setEscalatingZone] = useState<Zone | null>(null);
  const [escalationLevel, setEscalationLevel] = useState<EscalationLevel>('L1');
  const [escalationNote, setEscalationNote] = useState('');
  const [escalating, setEscalating] = useState(false);

  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectBrand, setNewProjectBrand] = useState('');
  const [newProjectAgency, setNewProjectAgency] = useState('');
  const [newProjectLocation, setNewProjectLocation] = useState('');
  const [newProjectStartDate, setNewProjectStartDate] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const [showNewZoneDialog, setShowNewZoneDialog] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneDeliverable, setNewZoneDeliverable] = useState('');
  const [newZoneOwner, setNewZoneOwner] = useState('');
  const [newZoneStatus, setNewZoneStatus] = useState<'RED' | 'GREEN'>('RED');
  const [creatingZone, setCreatingZone] = useState(false);

  const [showNewUserDialog, setShowNewUserDialog] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'supervisor' | 'client'>('supervisor');
  const [creatingUser, setCreatingUser] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && (!userData || userData.role !== 'admin')) {
      router.push('/');
    }
  }, [userData, authLoading, router]);

  useEffect(() => {
    async function loadData() {
      try {
        const projectsData = await getProjects();
        setProjects(projectsData);

        if (projectsData.length > 0) {
          const projectId = projectsData[0].id;
          setSelectedProject(projectId);

          const zonesData = await getZonesByProject(projectId);
          setZones(zonesData);
        }

        // Load users
        const { data: usersData } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });
        if (usersData) {
          setUsers(usersData);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    if (userData?.role === 'admin') {
      loadData();
    }
  }, [userData]);

  const handleZoneClick = (zoneId: string) => {
    router.push(`/zone/${zoneId}`);
  };

  const handleEscalate = (zoneId: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (zone) {
      setEscalatingZone(zone);
      setShowEscalateDialog(true);
    }
  };

  const handleEscalateSubmit = async () => {
    if (!escalatingZone || !userData || !escalationNote) {
      toast.error('Please provide escalation details');
      return;
    }

    setEscalating(true);
    try {
      await createEscalation(
        escalatingZone.projectId,
        escalatingZone.id,
        escalationLevel,
        escalationNote,
        userData.email
      );

      setZones(
        zones.map(z =>
          z.id === escalatingZone.id
            ? { ...z, isEscalated: true, escalationLevel }
            : z
        )
      );

      toast.success(`Zone escalated to ${escalationLevel}`);
      setShowEscalateDialog(false);
      setEscalationNote('');
      setEscalationLevel('L1');
    } catch (error) {
      console.error('Error escalating zone:', error);
      toast.error('Failed to escalate zone');
    } finally {
      setEscalating(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName || !newProjectBrand || !newProjectAgency || !newProjectLocation || !newProjectStartDate) {
      toast.error('Please fill in all fields');
      return;
    }

    setCreatingProject(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert([
          {
            name: newProjectName,
            brand: newProjectBrand,
            agency: newProjectAgency,
            location: newProjectLocation,
            start_date: newProjectStartDate,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setProjects([...projects, data as Project]);
      setSelectedProject(data.id);
      toast.success('Project created successfully!');
      setShowNewProjectDialog(false);
      setNewProjectName('');
      setNewProjectBrand('');
      setNewProjectAgency('');
      setNewProjectLocation('');
      setNewProjectStartDate('');
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error('Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateZone = async () => {
    if (!selectedProject || !newZoneName || !newZoneDeliverable || !newZoneOwner) {
      toast.error('Please fill in all required fields');
      return;
    }

    setCreatingZone(true);
    try {
      const { data, error } = await supabase
        .from('zones')
        .insert([
          {
            project_id: selectedProject,
            name: newZoneName,
            deliverable: newZoneDeliverable,
            owner: newZoneOwner,
            status: newZoneStatus,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      const newZone = data as Zone;
      setZones([...zones, newZone]);
      toast.success('Zone created successfully!');
      setShowNewZoneDialog(false);
      setNewZoneName('');
      setNewZoneDeliverable('');
      setNewZoneOwner('');
      setNewZoneStatus('RED');
    } catch (error) {
      console.error('Error creating zone:', error);
      toast.error('Failed to create zone');
    } finally {
      setCreatingZone(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (newUserPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setCreatingUser(true);
    try {
      // Create auth user using Supabase admin API
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newUserEmail,
        password: newUserPassword,
        email_confirm: true,
      });

      if (authError) throw authError;

      // Insert user record into users table
      const { error: dbError } = await supabase.from('users').insert([
        {
          uid: authData.user.id,
          email: newUserEmail,
          role: newUserRole,
          org_id: userData?.org_id || 'org_001',
        },
      ]);

      if (dbError) throw dbError;

      // Refresh users list
      const { data: usersData } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (usersData) {
        setUsers(usersData);
      }

      toast.success(`User created successfully! Login: ${newUserEmail}`);
      setShowNewUserDialog(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('supervisor');
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(error.message || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete project "${projectName}"? This will also delete all associated zones, proofs, and updates. This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase.from('projects').delete().eq('id', projectId);

      if (error) throw error;

      // Remove from local state
      setProjects(projects.filter(p => p.id !== projectId));

      // If this was the selected project, clear zones
      if (selectedProject === projectId) {
        setSelectedProject(null);
        setZones([]);
      }

      toast.success('Project deleted successfully');
    } catch (error: any) {
      console.error('Error deleting project:', error);
      toast.error(error.message || 'Failed to delete project');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  const project = projects.find(p => p.id === selectedProject);
  const overallStatus = zones.some(z => z.status === 'RED')
    ? 'RED'
    : 'GREEN';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b0e14] via-[#121826] to-[#0b0e14]">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-xl font-black text-black">★</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">CELESTAR PORTAL</h1>
              <p className="text-sm text-gray-400">Admin Console • Full Control</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge className="border-purple-500/40 bg-purple-500/12 text-purple-200">
              Role: ADMIN
            </Badge>
            <Badge className="border-gray-700 bg-gray-800/50 text-gray-300">
              {userData?.email}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut()}
              className="border-gray-700 bg-gray-800/50 hover:bg-gray-700"
            >
              Logout
            </Button>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="bg-[#121826]/90 border border-[#23304a]">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="zones">Zones</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            {project && (
              <>
                <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-white text-xl">{project.name}</CardTitle>
                        <div className="flex gap-4 mt-2 text-sm text-gray-400">
                          <span>Brand: {project.brand}</span>
                          <span>Agency: {project.agency}</span>
                          <span>Location: {project.location}</span>
                        </div>
                      </div>
                      <Badge
                        className={
                          overallStatus === 'RED'
                            ? 'border-red-500/40 bg-red-500/12 text-red-200'
                            : 'border-green-500/40 bg-green-500/12 text-green-200'
                        }
                      >
                        Overall: {overallStatus}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>

                <RAGCounters zones={zones} />

                <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
                  <CardHeader>
                    <CardTitle className="text-white">Zone Management</CardTitle>
                    <p className="text-sm text-gray-400 mt-1">
                      Click on zones to view details or escalate critical issues
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ZoneTable
                      zones={zones}
                      onZoneClick={handleZoneClick}
                      showEscalateButton
                      onEscalate={handleEscalate}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="projects">
            <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-white">Project Management</CardTitle>
                <Button
                  onClick={() => setShowNewProjectDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  + New Project
                </Button>
              </CardHeader>
              <CardContent>
                {projects.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400 mb-4">No projects yet. Create your first project to get started!</p>
                    <Button
                      onClick={() => setShowNewProjectDialog(true)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Create First Project
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="p-4 bg-black/25 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-white mb-1">{project.name}</div>
                            <div className="text-sm text-gray-400">
                              {project.brand} • {project.agency} • {project.location}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">Start Date: {project.startDate}</div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteProject(project.id, project.name)}
                            className="border-red-700 bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-200"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="zones">
            <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-white">Zone Management</CardTitle>
                  {selectedProject && (
                    <p className="text-sm text-gray-400 mt-1">
                      Managing zones for: {projects.find(p => p.id === selectedProject)?.name}
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => setShowNewZoneDialog(true)}
                  disabled={!selectedProject}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  + New Zone
                </Button>
              </CardHeader>
              <CardContent>
                {!selectedProject ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400">Please create or select a project first</p>
                  </div>
                ) : zones.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400 mb-4">No zones yet. Create your first zone to track deliverables!</p>
                    <Button
                      onClick={() => setShowNewZoneDialog(true)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Create First Zone
                    </Button>
                  </div>
                ) : (
                  <ZoneTable
                    zones={zones}
                    onZoneClick={handleZoneClick}
                    showEscalateButton
                    onEscalate={handleEscalate}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-white">User Management</CardTitle>
                <Button
                  onClick={() => setShowNewUserDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  + New User
                </Button>
              </CardHeader>
              <CardContent>
                {users.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-400 mb-4">No users yet. Create your first user!</p>
                    <Button
                      onClick={() => setShowNewUserDialog(true)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Create First User
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">Email</th>
                          <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">Role</th>
                          <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.uid} className="border-b border-gray-800/50">
                            <td className="py-3 px-4 text-white">{user.email}</td>
                            <td className="py-3 px-4">
                              <Badge
                                className={
                                  user.role === 'admin'
                                    ? 'border-purple-500/40 bg-purple-500/12 text-purple-200'
                                    : user.role === 'supervisor'
                                    ? 'border-blue-500/40 bg-blue-500/12 text-blue-200'
                                    : 'border-green-500/40 bg-green-500/12 text-green-200'
                                }
                              >
                                {user.role.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-gray-400 text-xs">
                              {new Date(user.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showEscalateDialog} onOpenChange={setShowEscalateDialog}>
        <DialogContent className="bg-[#0f1522] border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Escalate Zone</DialogTitle>
          </DialogHeader>
          {escalatingZone && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-1">Zone:</p>
                <p className="font-semibold text-white">{escalatingZone.name}</p>
              </div>

              <div className="space-y-2">
                <Label>Escalation Level</Label>
                <Select
                  value={escalationLevel}
                  onValueChange={(value) => setEscalationLevel(value as EscalationLevel)}
                >
                  <SelectTrigger className="bg-black/25 border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L1">L1 - Team Lead</SelectItem>
                    <SelectItem value="L2">L2 - Project Manager</SelectItem>
                    <SelectItem value="L3">L3 - Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Escalation Note</Label>
                <Textarea
                  value={escalationNote}
                  onChange={(e) => setEscalationNote(e.target.value)}
                  placeholder="Describe the issue and required action..."
                  className="bg-black/25 border-gray-700"
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEscalateDialog(false)}
              className="border-gray-700"
            >
              Cancel
            </Button>
            <Button onClick={handleEscalateSubmit} disabled={escalating || !escalationNote}>
              {escalating ? 'Escalating...' : 'Escalate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
        <DialogContent className="bg-[#0f1522] border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Project Name</Label>
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g., 2025 Summer Campaign"
                className="bg-black/25 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Brand</Label>
              <Input
                value={newProjectBrand}
                onChange={(e) => setNewProjectBrand(e.target.value)}
                placeholder="e.g., Nike"
                className="bg-black/25 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Agency</Label>
              <Input
                value={newProjectAgency}
                onChange={(e) => setNewProjectAgency(e.target.value)}
                placeholder="e.g., Wieden+Kennedy"
                className="bg-black/25 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Location</Label>
              <Input
                value={newProjectLocation}
                onChange={(e) => setNewProjectLocation(e.target.value)}
                placeholder="e.g., Los Angeles, CA"
                className="bg-black/25 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Start Date</Label>
              <Input
                type="date"
                value={newProjectStartDate}
                onChange={(e) => setNewProjectStartDate(e.target.value)}
                className="bg-black/25 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewProjectDialog(false)}
              className="border-gray-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={creatingProject || !newProjectName || !newProjectBrand || !newProjectAgency || !newProjectLocation || !newProjectStartDate}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creatingProject ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewZoneDialog} onOpenChange={setShowNewZoneDialog}>
        <DialogContent className="bg-[#0f1522] border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Zone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Zone Name</Label>
              <Input
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder="e.g., Video Production"
                className="bg-black/25 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Deliverable</Label>
              <Input
                value={newZoneDeliverable}
                onChange={(e) => setNewZoneDeliverable(e.target.value)}
                placeholder="e.g., 30s TV Commercial"
                className="bg-black/25 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Owner</Label>
              <Input
                value={newZoneOwner}
                onChange={(e) => setNewZoneOwner(e.target.value)}
                placeholder="e.g., John Smith"
                className="bg-black/25 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Initial Status</Label>
              <Select
                value={newZoneStatus}
                onValueChange={(value) => setNewZoneStatus(value as 'RED' | 'GREEN')}
              >
                <SelectTrigger className="bg-black/25 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RED">RED - Not Verified</SelectItem>
                  <SelectItem value="GREEN">GREEN - Verified</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewZoneDialog(false)}
              className="border-gray-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateZone}
              disabled={creatingZone || !newZoneName || !newZoneDeliverable || !newZoneOwner}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creatingZone ? 'Creating...' : 'Create Zone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewUserDialog} onOpenChange={setShowNewUserDialog}>
        <DialogContent className="bg-[#0f1522] border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Email</Label>
              <Input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="e.g., supervisor@company.com"
                className="bg-black/25 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Password</Label>
              <Input
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="bg-black/25 border-gray-700 text-white placeholder:text-gray-500"
              />
              <p className="text-xs text-gray-500">User will use this password to login</p>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Role</Label>
              <Select
                value={newUserRole}
                onValueChange={(value) => setNewUserRole(value as 'supervisor' | 'client')}
              >
                <SelectTrigger className="bg-black/25 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supervisor">Supervisor - Can upload proof and update zones</SelectItem>
                  <SelectItem value="client">Client - View-only access</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewUserDialog(false)}
              className="border-gray-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={creatingUser || !newUserEmail || !newUserPassword}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creatingUser ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
