import React, { useState, useEffect, useRef } from 'react';
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
  Bug
} from 'lucide-react';
import { LogEntry } from '../types';
import apiService from '../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [componentFilter, setComponentFilter] = useState('all');
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const logLevels = ['all', 'INFO', 'WARN', 'ERROR', 'DEBUG'];
  const logIcons = {
    INFO: Info,
    WARN: AlertTriangle,
    ERROR: AlertCircle,
    DEBUG: Bug
  };

  const logColors = {
    INFO: 'log-info',
    WARN: 'log-warn',
    ERROR: 'log-error',
    DEBUG: 'log-debug'
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, levelFilter, componentFilter]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  const fetchLogs = async (pageNum = 1, append = false) => {
    try {
      if (!append) setLoading(true);
      
      const response = await apiService.getLogs({
        page: pageNum,
        limit: 100,
        ...(levelFilter !== 'all' && { level: levelFilter }),
        ...(componentFilter !== 'all' && { component: componentFilter }),
        ...(searchTerm && { search: searchTerm })
      });

      if (append) {
        setLogs(prev => [...prev, ...response.data]);
      } else {
        setLogs(response.data);
      }

      setHasMore(response.pagination ? pageNum < response.pagination.totalPages : false);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchLogs(nextPage, true);
  };

  const filterLogs = () => {
    let filtered = logs;

    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.component.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (levelFilter !== 'all') {
      filtered = filtered.filter(log => log.level === levelFilter);
    }

    if (componentFilter !== 'all') {
      filtered = filtered.filter(log => log.component === componentFilter);
    }

    setFilteredLogs(filtered);
  };

  const getUniqueComponents = () => {
    const components = new Set(logs.map(log => log.component));
    return ['all', ...Array.from(components)];
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

  const exportLogs = () => {
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
    a.download = `logs-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Logs exported successfully');
  };

  const clearFilters = () => {
    setSearchTerm('');
    setLevelFilter('all');
    setComponentFilter('all');
    setPage(1);
    fetchLogs();
  };

  const refreshLogs = () => {
    setPage(1);
    fetchLogs();
    toast.success('Logs refreshed');
  };

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setAutoScroll(isNearBottom);
    }
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="input-field w-auto min-w-[120px]"
          >
            {logLevels.map(level => (
              <option key={level} value={level}>
                {level === 'all' ? 'All Levels' : level}
              </option>
            ))}
          </select>

          <select
            value={componentFilter}
            onChange={(e) => setComponentFilter(e.target.value)}
            className="input-field w-auto min-w-[140px]"
          >
            {getUniqueComponents().map(component => (
              <option key={component} value={component}>
                {component === 'all' ? 'All Components' : component}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={clearFilters}
            className="btn-secondary"
          >
            <Filter className="w-4 h-4 mr-2" />
            Clear
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={exportLogs}
            className="btn-secondary"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={refreshLogs}
            className="btn-primary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </motion.button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredLogs.length} log entries
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Auto-scroll:</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded ${autoScroll ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'}`}
          >
            {autoScroll ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden"
      >
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="max-h-[600px] overflow-y-auto space-y-1 p-4"
        >
          <AnimatePresence>
            {filteredLogs.map((log, index) => {
              const Icon = logIcons[log.level as keyof typeof logIcons] || Info;
              const isExpanded = expandedLogs.has(log.id);
              const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.02 }}
                  className={`p-3 rounded-lg border-l-4 ${logColors[log.level as keyof typeof logColors]} hover:shadow-sm transition-shadow`}
                >
                  <div className="flex items-start space-x-3">
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      log.level === 'ERROR' ? 'text-red-500' :
                      log.level === 'WARN' ? 'text-yellow-500' :
                      log.level === 'INFO' ? 'text-blue-500' :
                      'text-gray-500'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          log.level === 'ERROR' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                          log.level === 'WARN' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                          log.level === 'INFO' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                        }`}>
                          {log.level}
                        </span>

                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {log.component}
                        </span>

                        <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                          <Clock className="w-3 h-3" />
                          <span>{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                          <Calendar className="w-3 h-3 ml-2" />
                          <span>{format(new Date(log.timestamp), 'MMM dd')}</span>
                        </div>
                      </div>

                      <p className="text-sm text-gray-900 dark:text-gray-100 break-words">
                        {log.message}
                      </p>

                      {hasMetadata && (
                        <div className="mt-2">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            onClick={() => toggleLogExpansion(log.id)}
                            className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <span>Metadata</span>
                          </motion.button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs font-mono overflow-x-auto"
                              >
                                <pre className="text-gray-700 dark:text-gray-300">
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
            <div className="text-center py-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={loadMore}
                className="btn-secondary"
                disabled={loading}
              >
                {loading ? (
                  <div className="flex items-center">
                    <div className="loading-spinner mr-2"></div>
                    Loading...
                  </div>
                ) : (
                  'Load More'
                )}
              </motion.button>
            </div>
          )}

          <div ref={logsEndRef} />
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-500 dark:text-gray-400">
              {searchTerm || levelFilter !== 'all' || componentFilter !== 'all' 
                ? 'No logs match your filters' 
                : 'No logs found'
              }
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Logs;