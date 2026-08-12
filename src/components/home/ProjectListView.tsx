import { useMemo, useState } from 'react';
import { MoreVertical, Trash2, Edit2, Check, X, ExternalLink, ArrowDown } from 'lucide-react';

import { SelectionBar } from '@/components/craft/SelectionBar';
import { format } from 'date-fns';
import { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useProjectActions } from '@/hooks/useProjectActions';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Project } from './ProjectCard';

const titleSchema = z.string().trim().min(1, 'Title cannot be empty').max(100, 'Title must be less than 100 characters');

interface ProjectListViewProps {
  projects: Project[];
  onOpenProject: (projectId: string) => void;
  onRefresh?: () => void;
}

export const ProjectListView = ({ projects, onOpenProject, onRefresh }: ProjectListViewProps) => {
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [sort, setSort] = useState<{ key: 'title' | 'updated'; dir: 1 | -1 }>({
    key: 'updated',
    dir: -1,
  });
  const { deleteProject } = useProjectActions();

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => {
      const value =
        sort.key === 'title'
          ? a.title.localeCompare(b.title)
          : new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      return value * sort.dir;
    });
  }, [projects, sort]);

  const toggleSort = (key: 'title' | 'updated') =>
    setSort((current) =>
      current.key === key ? { key, dir: (current.dir * -1) as 1 | -1 } : { key, dir: 1 },
    );
  const { toast } = useToast();

  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedProjects(new Set());
  };

  const toggleProject = (projectId: string) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedProjects(newSelected);
  };

  const selectAll = () => {
    setSelectedProjects(new Set(projects.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedProjects(new Set());
  };

  const handleBulkDelete = async () => {
    const projectsToDelete = Array.from(selectedProjects);
    let successCount = 0;
    
    for (const projectId of projectsToDelete) {
      const success = await deleteProject(projectId);
      if (success) successCount++;
    }

    if (successCount > 0) {
      toast({
        title: 'Success',
        description: `${successCount} project${successCount > 1 ? 's' : ''} deleted successfully.`,
      });
      onRefresh?.();
    }

    setSelectedProjects(new Set());
    setDeleteDialogOpen(false);
    setIsSelectMode(false);
  };

  const startEditing = (project: Project) => {
    setEditingId(project.id);
    setEditValue(project.title);
    setEditError('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValue('');
    setEditError('');
  };

  const saveTitle = async (projectId: string) => {
    try {
      const validated = titleSchema.parse(editValue);
      
      const { error } = await supabase
        .from('projects')
        .update({ title: validated, updated_at: new Date().toISOString() })
        .eq('id', projectId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Project title updated.',
      });
      
      onRefresh?.();
      setEditingId(null);
      setEditValue('');
    } catch (error) {
      if (error instanceof z.ZodError) {
        setEditError(error.issues[0].message);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to update project title.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleDeleteSingle = async (projectId: string) => {
    const success = await deleteProject(projectId);
    if (success) {
      onRefresh?.();
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            onClick={toggleSelectMode}
            variant={isSelectMode ? 'default' : 'outline'}
            size="sm"
            className={isSelectMode ? 'bg-orange-600 hover:bg-orange-700' : ''}
          >
            {isSelectMode ? 'Cancel Select' : 'Select'}
          </Button>
          
          {isSelectMode && (
            <>
              <Button onClick={selectAll} variant="ghost" size="sm">
                Select All
              </Button>
              <SelectionBar count={selectedProjects.size} onClear={deselectAll}>
                <button
                  type="button"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="flex h-6 items-center gap-1.5 rounded-full px-2 text-[12.5px] font-medium text-red-500 transition-colors duration-100 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </SelectionBar>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border-default bg-surface-1 overflow-hidden dark:border-white/[0.08] dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-default bg-surface-2 dark:border-white/[0.08] dark:bg-white/[0.02]">
                <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider dark:text-white/60">
                  <button
                    type="button"
                    onClick={() => toggleSort('title')}
                    className="flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-text-primary dark:hover:text-white"
                  >
                    Title
                    <ArrowDown
                      className={`h-3 w-3 transition-[opacity,transform] duration-200 ${
                        sort.key === 'title' ? 'opacity-100' : 'opacity-0'
                      }`}
                      style={{
                        transform: sort.key === 'title' && sort.dir === -1 ? 'rotate(180deg)' : undefined,
                      }}
                    />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider dark:text-white/60">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider dark:text-white/60">
                  <button
                    type="button"
                    onClick={() => toggleSort('updated')}
                    className="flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-text-primary dark:hover:text-white"
                  >
                    Updated
                    <ArrowDown
                      className={`h-3 w-3 transition-[opacity,transform] duration-200 ${
                        sort.key === 'updated' ? 'opacity-100' : 'opacity-0'
                      }`}
                      style={{
                        transform: sort.key === 'updated' && sort.dir === -1 ? 'rotate(180deg)' : undefined,
                      }}
                    />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider dark:text-white/60">
                  Visibility
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-text-tertiary uppercase tracking-wider dark:text-white/60">
                  Actions
                </th>
                {isSelectMode && (
                  <th className="px-6 py-3 text-center text-xs font-medium text-text-tertiary uppercase tracking-wider w-20 dark:text-white/60">
                    Select
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default dark:divide-white/[0.08]">
              {sortedProjects.map((project) => (
                <tr
                  key={project.id}
                  className="hover:bg-surface-2 transition-colors dark:hover:bg-white/[0.02]"
                >
                  {/* Title */}
                  <td className="px-6 py-4">
                    {editingId === project.id ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-8 max-w-md"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveTitle(project.id);
                              if (e.key === 'Escape') cancelEditing();
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => saveTitle(project.id)}
                          >
                            <Check className="w-4 h-4 text-orange-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={cancelEditing}
                          >
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                        {editError && (
                          <p className="text-xs text-red-500">{editError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => onOpenProject(project.id)}
                          className="text-sm font-medium text-text-primary hover:text-accent-purple transition-colors text-left dark:text-white dark:hover:text-orange-400"
                        >
                          {project.title}
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <Badge
                      variant="outline"
                      className="bg-orange-500/10 text-orange-600 border-orange-400/30 dark:text-orange-300"
                    >
                      Active
                    </Badge>
                  </td>

                  {/* Updated */}
                  <td className="px-6 py-4">
                    <span className="text-sm text-text-tertiary dark:text-white/60">
                      {format(new Date(project.updated_at), 'MMM d, yyyy')}
                    </span>
                  </td>

                  {/* Visibility */}
                  <td className="px-6 py-4">
                    <Badge
                      variant="outline"
                      className={
                        project.is_private
                          ? 'bg-blue-500/10 text-blue-600 border-blue-400/30 dark:text-blue-300'
                          : 'bg-amber-500/10 text-amber-600 border-amber-400/30 dark:text-amber-300'
                      }
                    >
                      {project.is_private ? 'Private' : 'Public'}
                    </Badge>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => startEditing(project)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => onOpenProject(project.id)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => startEditing(project)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Edit Title
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteSingle(project.id)}
                            className="text-red-500 focus:text-red-500"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>

                  {/* Checkbox */}
                  {isSelectMode && (
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={selectedProjects.has(project.id)}
                          onCheckedChange={() => toggleProject(project.id)}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-default bg-surface-2 dark:border-white/[0.08] dark:bg-white/[0.02]">
                <td
                  colSpan={isSelectMode ? 6 : 5}
                  className="px-6 py-2.5 text-xs text-text-tertiary tabular-nums dark:text-white/50"
                >
                  <span className="font-semibold text-text-secondary dark:text-white/70">
                    {projects.length}
                  </span>{' '}
                  {projects.length === 1 ? 'project' : 'projects'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Projects</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedProjects.size} project{selectedProjects.size > 1 ? 's' : ''}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
