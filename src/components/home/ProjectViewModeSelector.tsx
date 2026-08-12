import { SegmentedControl } from '@/components/craft/SegmentedControl';

type ViewMode = 'grid' | 'list';

interface ProjectViewModeSelectorProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const ProjectViewModeSelector = ({ viewMode, setViewMode }: ProjectViewModeSelectorProps) => {
  return (
    <SegmentedControl<ViewMode>
      segments={[
        { value: 'grid', label: 'Grid', ariaLabel: 'Grid view' },
        { value: 'list', label: 'List', ariaLabel: 'List view' },
      ]}
      value={viewMode}
      onChange={setViewMode}
    />
  );
};
