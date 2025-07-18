import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  Play,
  Pause,
  ChevronDown,
  ChevronRight,
  Calendar,
  Clock,
  AlertCircle,
  Info,
  AlertTriangle,
  Bug,
  Server,
  Wifi,
  WifiOff,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  X,
  Tag,
  Bookmark
} from 'lucide-react';
import { LogEntry } from '../types';
import apiService from '../services/api';
import { useStore } from '../store/useStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { LoadingSpinner, ActionButton, MetricCard } from '../components/shared';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';

const Logs: React.FC = () => {
  const { 
    logs, 
    logsLoading,
    setLogs, 
    addLog, 
    setLogsLoading, 
    setLogsError 
  } = useStore();

  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [componentFilter, setComponentFilter] = useState('all');
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [components, setComponents] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [savedFilters, setSavedFilters] = useState<Array<{name: string, filters: any}>>([]);
  const [filterPresetName, setFilterPresetName] = useState('');
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isConnected } = useWebSocket(handleWebSocketMessage);

  const logLevels = ['all', 'INFO', 'WARN', 'ERROR', 'DEBUG'];

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, levelFilter, componentFilter, sortDirection]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current && logs.length > 0) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll, logs.length]);

  useEffect(() => {
    const safeLogsList = Array.isArray(logs) ? logs : [];
    const uniqueComponents = Array.from(new Set(safeLogsList.map(log => log.component))).sort();
    setComponents(uniqueComponents);
  }, [logs]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdateTime(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    updateActiveFilters();
  }, [searchTerm, levelFilter, componentFilter]);

  function handleWebSocketMessage(event: { type: string; data?: LogEntry }) {
    if (isStreaming && event.type === 'log_entry' && event.data) {
      addLog(event.data);
      setLastUpdateTime(new Date());
    }
  }

  const updateActiveFilters = () => {
    const filters: string[] = [];
    if (searchTerm.trim()) filters.push(`search:${searchTerm.trim()}`);
    if (levelFilter !== 'all') filters.push(`level:${levelFilter}`);
    if (componentFilter !== 'all') filters.push(`component:${componentFilter}`);
    setActiveFilters(filters);
  };

  const removeFilter = (filterToRemove: string) => {
    const [type, value] = filterToRemove.split(':');
    switch (type) {
      case 'search':
        setSearchTerm('');
        break;
      case 'level':
        setLevelFilter('all');
        break;
      case 'component':
        setComponentFilter('all');
        break;
    }
  };

  const saveCurrentFilter = () => {
    if (!filterPresetName.trim()) return;
    
    const newFilter = {
      name: filterPresetName,
      filters: {
        searchTerm,
        levelFilter,
        componentFilter
      }
    };
    
    setSavedFilters(prev => [...prev, newFilter]);
    setFilterPresetName('');
    setShowSaveFilter(false);
    toast.success(`Filter "${filterPresetName}" saved`);
  };

  const applySavedFilter = (savedFilter: any) => {
    setSearchTerm(savedFilter.filters.searchTerm);
    setLevelFilter(savedFilter.filters.levelFilter);
    setComponentFilter(savedFilter.filters.componentFilter);
    toast.success(`Applied filter "${savedFilter.name}"`);
  };

  const deleteSavedFilter = (index: number) => {
    const filterName = savedFilters[index].name;
    setSavedFilters(prev => prev.filter((_, i) => i !== index));
    toast.success(`Filter "${filterName}" deleted`);
  };

  const fetchLogs = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (!append) setLogsLoading(true);
      setLogsError(null);
      
      const params: Record<string, string | number> = {
        page: pageNum,
        limit: 100,
      };

      if (levelFilter !== 'all') params.level = levelFilter;
      if (componentFilter !== 'all') params.component = componentFilter;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const response = await apiService.getLogs(params, false);
      
      const logsData = Array.isArray(response.data) ? response.data : [];
      const pagination = response.pagination;

      if (append) {
        const currentLogs = Array.isArray(logs) ? logs : [];
        setLogs([...currentLogs, ...logsData]);
      } else {
        setLogs(logsData);
      }

      setHasMore(pagination ? pageNum < pagination.totalPages : false);
      setLastUpdateTime(new Date());
      
      if (logsData.length === 0 && pageNum === 1) {
        toast.info('No logs found matching your criteria');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load logs. Please try again.';
      setLogsError(errorMessage);
      toast.error(errorMessage);
      console.error('Failed to fetch logs:', error);
    } finally {
      setLogsLoading(false);
    }
  }, [levelFilter, componentFilter, searchTerm, logs, setLogs, setLogsLoading, setLogsError]);

  const filterLogs = useCallback(() => {
    const safeLogsList = Array.isArray(logs) ? logs : [];
    let filtered = [...safeLogsList];

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(searchLower) ||
        log.component.toLowerCase().includes(searchLower) ||
        (log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(searchLower))
      );
    }

    if (levelFilter !== 'all') {
      filtered = filtered.filter(log => log.level === levelFilter);
    }

    if (componentFilter !== 'all') {
      filtered = filtered.filter(log => log.component === componentFilter);
    }

    filtered.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortDirection === 'desc' ? timeB - timeA : timeA - timeB;
    });

    setFilteredLogs(filtered);
  }, [logs, searchTerm, levelFilter, componentFilter, sortDirection]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLogs(nextPage, true);
  };

  const toggleLogExpansion = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const copyLogEntry = async (log: LogEntry) => {
    const logText = `[${log.timestamp}] ${log.level} ${log.component}: ${log.message}${
      log.metadata ? '\nMetadata: ' + JSON.stringify(log.metadata, null, 2) : ''
    }`;
    
    try {
      await navigator.clipboard.writeText(logText);
      setCopiedLogId(log.id || `${log.timestamp}-${log.component}`);
      setTimeout(() => setCopiedLogId(null), 2000);
      toast.success('Log entry copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy log entry');
    }
  };

  const exportLogs = () => {
    if (filteredLogs.length === 0) {
      toast.error('No logs to export');
      return;
    }

    const exportData = filteredLogs.map(log => ({
      timestamp: log.timestamp,
      level: log.level,
      component: log.component,
      message: log.message,
      metadata: log.metadata
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredLogs.length} log entries`);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setLevelFilter('all');
    setComponentFilter('all');
    setPage(1);
    setShowFilters(false);
    toast.success('Filters cleared');
  };

  const refreshLogs = () => {
    setPage(1);
    setExpandedLogs(new Set());
    fetchLogs(1, false);
  };

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setAutoScroll(isNearBottom);
    }
  }, []);

  const toggleStreaming = () => {
    const newStreaming = !isStreaming;
    setIsStreaming(newStreaming);
    
    if (newStreaming) {
      toast.success('Real-time log streaming enabled');
    } else {
      toast.success('Real-time log streaming paused');
    }
  };

  const toggleSortDirection = () => {
    setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  const getLevelStats = () => {
    const safeLogsList = Array.isArray(logs) ? logs : [];
    const stats = logLevels.slice(1).map(level => ({
      level,
      count: safeLogsList.filter(log => log.level === level).length
    }));
    return stats;
  };

  const getFormattedTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      time: format(date, 'HH:mm:ss'),
      date: format(date, 'MMM dd'),
      relative: formatDistanceToNow(date, { addSuffix: true })
    };
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'INFO':
        return Info;
      case 'WARN':
        return AlertTriangle;
      case 'ERROR':
        return AlertCircle;
      case 'DEBUG':
        return Bug;
      default:
        return Info;
    }
  };

  const getLogColors = (level: string, index: number) => {
    const baseColors = index % 2 === 0 
      ? 'bg-white dark:bg-gray-800' 
      : 'bg-gray-50 dark:bg-gray-750';
    
    switch (level) {
      case 'INFO':
        return `border-l-blue-500 ${baseColors}`;
      case 'WARN':
        return `border-l-yellow-500 ${baseColors}`;
      case 'ERROR':
        return `border-l-red-500 ${baseColors}`;
      case 'DEBUG':
        return `border-l-gray-500 ${baseColors}`;
      default:
        return `border-l-gray-500 ${baseColors}`;
    }
  };

  const getLogTextColors = (level: string) => {
    switch (level) {
      case 'INFO':
        return 'text-blue-600 dark:text-blue-400';
      case 'WARN':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'ERROR':
        return 'text-red-600 dark:text-red-400';
      case 'DEBUG':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getLogEmojiIcon = (level: string) => {
    switch (level) {
      case 'INFO':
        return 'ℹ️';
      case 'WARN':
        return '⚠️';
      case 'ERROR':
        return '❌';
      case 'DEBUG':
        return '🐞';
      default:
        return 'ℹ️';
    }
  };

  if (logsLoading && (!logs || logs.length === 0)) {
    return <LoadingSpinner message="Loading system logs..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search logs by message, component, or metadata..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 focus:ring-0 transition-colors text-sm"
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 transition-colors text-sm flex items-center space-x-2 ${
              showFilters ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300' : ''
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
            {(levelFilter !== 'all' || componentFilter !== 'all') && (
              <span className="bg-blue-500 text-white text-xs rounded-full w-2 h-2"></span>
            )}
          </button>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-2">
          <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm">
            {isConnected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            <span className="text-gray-600 dark:text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600 dark:text-gray-400">
              {formatDistanceToNow(lastUpdateTime, { addSuffix: true })}
            </span>
          </div>

          <ActionButton
            onClick={toggleStreaming}
            variant={isStreaming ? 'success' : 'secondary'}
            size="sm"
            icon={isStreaming ? Pause : Play}
            className={isStreaming ? 'animate-pulse' : ''}
          >
            {isStreaming ? (
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-ping"></div>
                <span>Streaming</span>
              </div>
            ) : (
              'Stream'
            )}
          </ActionButton>

          <ActionButton
            onClick={exportLogs}
            disabled={filteredLogs.length === 0}
            variant="primary"
            size="sm"
            icon={Download}
          >
            Export
          </ActionButton>

          <ActionButton
            onClick={refreshLogs}
            disabled={logsLoading}
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={logsLoading}
          >
            Refresh
          </ActionButton>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-gray-600 dark:text-gray-400">Active filters:</span>
          {activeFilters.map((filter, index) => {
            const [type, value] = filter.split(':');
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center space-x-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 px-3 py-1 rounded-full text-sm"
              >
                <Tag className="w-3 h-3" />
                <span>{type}:</span>
                <span className="font-medium">{value}</span>
                <button
                  onClick={() => removeFilter(filter)}
                  className="ml-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            );
          })}
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4"
          >
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Log Level
                </label>
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:border-blue-500 text-sm"
                >
                  {logLevels.map(level => (
                    <option key={level} value={level}>
                      {level === 'all' ? 'All Levels' : level}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Component
                </label>
                <select
                  value={componentFilter}
                  onChange={(e) => setComponentFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:border-blue-500 text-sm"
                >
                  <option value="all">All Components</option>
                  {components.map(component => (
                    <option key={component} value={component}>
                      {component}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end space-x-2">
                <ActionButton onClick={clearFilters} variant="secondary" size="sm">
                  Clear Filters
                </ActionButton>
                <ActionButton
                  onClick={() => setShowSaveFilter(!showSaveFilter)}
                  variant="primary"
                  size="sm"
                  icon={Bookmark}
                >
                  Save
                </ActionButton>
              </div>
            </div>

            <AnimatePresence>
              {showSaveFilter && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t pt-4"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Filter preset name..."
                      value={filterPresetName}
                      onChange={(e) => setFilterPresetName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:border-blue-500 text-sm"
                    />
                    <ActionButton
                      onClick={saveCurrentFilter}
                      disabled={!filterPresetName.trim()}
                      variant="success"
                      size="sm"
                    >
                      Save
                    </ActionButton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {savedFilters.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Saved Filter Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {savedFilters.map((savedFilter, index) => (
                    <div
                      key={index}
                      className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded-lg"
                    >
                      <button
                        onClick={() => applySavedFilter(savedFilter)}
                        className="text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {savedFilter.name}
                      </button>
                      <button
                        onClick={() => deleteSavedFilter(index)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {getLevelStats().map(({ level, count }) => {
          const IconComponent = getLogIcon(level);
          const color = level === 'INFO' ? 'blue' : level === 'WARN' ? 'yellow' : level === 'ERROR' ? 'red' : 'gray';
          
          return (
            <MetricCard
              key={level}
              icon={IconComponent}
              label={level}
              value={count.toLocaleString()}
              color={color}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredLogs.length.toLocaleString()} of {Array.isArray(logs) ? logs.length.toLocaleString() : '0'} log entries
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={toggleSortDirection}
            className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <span>Sort by time</span>
            {sortDirection === 'desc' ? (
              <ArrowDown className="w-4 h-4" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>

          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Auto-scroll:</span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-2 rounded-lg transition-colors ${
                autoScroll 
                  ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400' 
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              {autoScroll ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </motion.button>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="max-h-[600px] overflow-y-auto"
        >
          <AnimatePresence>
            {filteredLogs.map((log, index) => {
              const IconComponent = getLogIcon(log.level);
              const logId = log.id || `${index}-${log.timestamp}`;
              const isExpanded = expandedLogs.has(logId);
              const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
              const timestamps = getFormattedTimestamp(log.timestamp);
              const isCopied = copiedLogId === logId;

              return (
                <motion.div
                  key={logId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.01 }}
                  className={`p-4 border-l-4 transition-all duration-200 hover:shadow-sm border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${getLogColors(log.level, index)}`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span className="text-lg">{getLogEmojiIcon(log.level)}</span>
                      <IconComponent className={`w-4 h-4 ${getLogTextColors(log.level)}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                            log.level === 'ERROR' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                            log.level === 'WARN' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            log.level === 'INFO' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                            'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}>
                            {log.level}
                          </span>

                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                            {log.component}
                          </span>

                          <div className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded-lg">
                            <Clock className="w-3 h-3 text-gray-500" />
                            <span className="text-xs text-gray-600 dark:text-gray-400 font-mono" title={timestamps.relative}>
                              🕒 {timestamps.time}
                            </span>
                            <Calendar className="w-3 h-3 text-gray-500 ml-1" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {timestamps.date}
                            </span>
                          </div>

                          <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
                            {timestamps.relative}
                          </div>
                        </div>

                        <button
                          onClick={() => copyLogEntry(log)}
                          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                          title="Copy log entry"
                        >
                          {isCopied ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      <p className="text-sm text-gray-900 dark:text-gray-100 break-words leading-relaxed font-mono bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                        {log.message}
                      </p>

                      {hasMetadata && (
                        <div className="mt-3">
                          <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => toggleLogExpansion(logId)}
                            className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-lg"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <span>📋 Metadata ({Object.keys(log.metadata).length} items)</span>
                          </motion.button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-600"
                              >
                                <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap font-mono">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {hasMore && (
            <div className="text-center py-4 border-t border-gray-100 dark:border-gray-700">
              <ActionButton
                onClick={loadMore}
                disabled={logsLoading}
                variant="primary"
                size="sm"
                loading={logsLoading}
              >
                Load More
              </ActionButton>
            </div>
          )}

          <div ref={logsEndRef} />
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <div className="text-gray-500 dark:text-gray-400 mb-2">
              {searchTerm || levelFilter !== 'all' || componentFilter !== 'all' 
                ? 'No logs match your current filters' 
                : 'No logs available'
              }
            </div>
            {(!searchTerm && levelFilter === 'all' && componentFilter === 'all') && (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                System logs will appear here as they are generated
              </p>
            )}
            {(searchTerm || levelFilter !== 'all' || componentFilter !== 'all') && (
              <button
                onClick={clearFilters}
                className="mt-3 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Clear filters to see all logs
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Logs;