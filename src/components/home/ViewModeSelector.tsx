import { SegmentedControl } from '@/components/craft/SegmentedControl';

type ViewMode = 'studio' | 'timeline' | 'editor';

interface ViewModeSelectorProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const ViewModeSelector = ({ viewMode, setViewMode }: ViewModeSelectorProps) => {
  return (
    <SegmentedControl<ViewMode>
      className="dark mx-auto w-fit"
      segments={[
        { value: 'studio', label: 'Studio' },
        { value: 'timeline', label: 'Timeline' },
        { value: 'editor', label: 'Editor' },
      ]}
      value={viewMode}
      onChange={setViewMode}
    />
  );
};
