'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Program, Workstream } from '@/lib/types';
import { ChevronDown, FolderOpen, Layers } from 'lucide-react';

interface GlobalSwitcherProps {
  currentProgramId?: string;
  currentWorkstreamId?: string;
}

export function GlobalSwitcher({ currentProgramId, currentWorkstreamId }: GlobalSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      // Fetch all programs
      const programsResponse = await fetch('/api/programs');
      const programsData = await programsResponse.json();
      setPrograms(programsData);

      // Fetch all workstreams for all programs
      const allWorkstreams = await Promise.all(
        programsData.map(async (program: Program) => {
          const response = await fetch(`/api/workstreams?program_id=${program.id}`);
          const data = await response.json();
          return data;
        })
      );

      setWorkstreams(allWorkstreams.flat());
    } catch (error) {
      console.error('Error fetching navigation data:', error);
    } finally {
      setLoading(false);
    }
  }

  const currentProgram = programs.find((p) => p.id === currentProgramId);
  const currentWorkstream = workstreams.find((w) => w.id === currentWorkstreamId);

  const displayText = currentWorkstream
    ? currentWorkstream.name
    : currentProgram
    ? currentProgram.name
    : 'Select Program or Workstream';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[300px] justify-between bg-black/25 border-gray-700 text-white hover:bg-black/40"
        >
          <div className="flex items-center gap-2 truncate">
            {currentWorkstream ? (
              <Layers className="w-4 h-4 text-blue-500" />
            ) : (
              <FolderOpen className="w-4 h-4 text-green-500" />
            )}
            <span className="truncate">{displayText}</span>
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 bg-gray-900 border-gray-700">
        <Command className="bg-gray-900">
          <CommandInput
            placeholder="Search programs & workstreams..."
            className="bg-gray-900 text-white border-gray-700"
          />
          <CommandList>
            <CommandEmpty className="text-gray-500 py-6 text-center">
              No results found.
            </CommandEmpty>

            {programs.map((program) => {
              const programWorkstreams = workstreams.filter(
                (ws) => ws.program_id === program.id
              );

              return (
                <div key={program.id}>
                  <CommandGroup
                    heading={
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-3 h-3 text-green-500" />
                        <span className="text-xs font-bold text-gray-400">
                          {program.name}
                        </span>
                      </div>
                    }
                  >
                    <CommandItem
                      onSelect={() => {
                        router.push('/programs');
                        setOpen(false);
                      }}
                      className="text-gray-300 hover:bg-gray-800 cursor-pointer"
                    >
                      <FolderOpen className="mr-2 h-4 w-4 text-green-500" />
                      <span>View Program Dashboard</span>
                    </CommandItem>

                    {programWorkstreams.map((workstream) => (
                      <CommandItem
                        key={workstream.id}
                        onSelect={() => {
                          router.push(`/workstreams/${workstream.id}`);
                          setOpen(false);
                        }}
                        className="text-gray-300 hover:bg-gray-800 cursor-pointer pl-8"
                      >
                        <Layers className="mr-2 h-4 w-4 text-blue-500" />
                        <span>{workstream.name}</span>
                        {workstream.overall_status && (
                          <span
                            className={`ml-auto text-xs font-bold ${
                              workstream.overall_status === 'GREEN'
                                ? 'text-green-400'
                                : 'text-red-400'
                            }`}
                          >
                            {workstream.overall_status}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator className="bg-gray-800" />
                </div>
              );
            })}

            {programs.length === 0 && !loading && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    router.push('/programs/new');
                    setOpen(false);
                  }}
                  className="text-blue-400 hover:bg-gray-800 cursor-pointer"
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  <span>Create your first program</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
