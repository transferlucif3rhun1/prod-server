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
  Trash2,
  Settings,
  Wifi,
  WifiOff
} from 'lucide-react';
import { LogEntry } from '../types';
import apiService from '../services/api';
import { useStore } from '../store/useStore';
import { useWebSocket } from '../hooks/useWebSocket';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const Logs: React.FC = () => {
  const { 
    logs, 
    logsLoading, 
    logsError,
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
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isConnected } = useWebSocket();

  const logLevels = ['all', 'INFO', 'WARN', 'ERROR', 'DEBUG'];
  const logIcons = {
    INFO: Info,
    WARN: AlertTriangle,
    ERROR: AlertCircle,
    DEBUG: Bug
  };

  const logColors = {
    INFO: 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/20',
    WARN: 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
    ERROR: 'border-l-red-500 bg-red-50 dark:bg-red-900/20',
    DEBUG: 'border-l-gray-500 bg-gray-50 dark:bg-gray-900/20'
  };

  const logTextColors = {
    INFO: 'text-blue-800 dark:text-blue-400',
    WARN: 'text-yellow-800 dark:text-yellow-400',
    ERROR: 'text-red-800 dark:text-red-400',
    DEBUG: 'text-gray-800 dark:text-gray-400'
  };

  // Load logs on component mount
  useEffect(() => {
    fetchLogs();
  }, []);

  // Filter logs when dependencies change
  useEffect(() => {
    filterLogs();
  }, [logs, searchTerm, levelFilter, componentFilter]);

  // Auto-scroll when new logs are added
  useEffect(() => {
    if (autoScroll && logsEndRef.current && logs.length > 0) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  // Extract unique components
  useEffect(() => {
    const uniqueComponents = Array.from(new Set(logs.map(log => log.component))).sort();
    setComponents(uniqueComponents);
  }, [logs]);

  const fetchLogs = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (!append) setLogsLoading(true);
      setLogsError(null);
      
      const response = await apiService.getLogs({
        page: pageNum,
        limit: 100,
        ...(levelFilter !== 'all' && { level: levelFilter }),
        ...(componentFilter !== 'all' && { component: componentFilter }),
        ...(searchTerm && { search: searchTerm })
      }, false); // Don't use cache for logs

      if (append) {
        setLogs([...logs, ...response.data]);
      } else {
        setLogs(response.data);
      }

      setHasMore(response.pagination ? pageNum < response.pagination.totalPages : false);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to fetch logs';
      setLogsError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLogsLoading(false);
    }
  }, [levelFilter, componentFilter, searchTerm, logs, setLogs, setLogsLoading, setLogsError]);

  const filterLogs = useCallback(() => {
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
  }, [logs, searchTerm, levelFilter, componentFilter]);

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

  const clearLogs = () => {
    if (!confirm('Are you sure you want to clear all logs? This action cannot be undone.')) {
      return;
    }
    setLogs([]);
    setFilteredLogs([]);
    toast.success('Logs cleared');
  };

  const clearFilters = () => {
    setSearchTerm('');
    setLevelFilter('all');
    setComponentFilter('all');
    setPage(1);
    toast.success('Filters cleared');
  };

  const refreshLogs = () => {
    setPage(1);
    fetchLogs(1, false);
  };

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setAutoScroll(isNearBottom);
    }
  };

  const toggleStreaming = () => {
    setIsStreaming(!isStreaming);
    if (!isStreaming) {
      toast.success('Log streaming enabled');
    } else {
      toast.success('Log streaming disabled');
    }
  };

  // Handle real-time log updates via WebSocket
  const handleWebSocketMessage = useCallback((event: any) => {
    if (event.type === 'log_entry' && isStreaming) {
      addLog(event.data);
    }
  }, [isStreaming, addLog]);

  // Loading State
  if (logsLoading && logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <p className="text-gray-600 dark:text-gray-400">Loading logs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 focus:ring-0 transition-colors"
            />
          </div>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 min-w-[120px]"
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
            className="px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 focus:border-blue-500 min-w-[140px]"
          >
            <option value="all">All Components</option>
            {components.map(component => (
              <option key={component} value={component}>
                {component}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
            {isConnected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={toggleStreaming}
            className={`px-4 py-2 rounded-lg transition-colors ${
              isStreaming 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-gray-600 hover:bg-gray-700 text-white'
            }`}
          >
            {isStreaming ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {isStreaming ? 'Stop Stream' : 'Start Stream'}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={clearFilters}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            <Filter className="w-4 h-4 mr-2" />
            Clear
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={exportLogs}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={clearLogs}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={refreshLogs}
            disabled={logsLoading}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {logLevels.slice(1).map(level => {
          const count = logs.filter(log => log.level === level).length;
          const Icon = logIcons[level as keyof typeof logIcons];
          
          return (
            <motion.div
              key={level}
              whileHover={{ scale: 1.02 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${
                  level === 'INFO' ? 'bg-blue-100 dark:bg-blue-900/20' :
                  level === 'WARN' ? 'bg-yellow-100 dark:bg-yellow-900/20' :
                  level === 'ERROR' ? 'bg-red-100 dark:bg-red-900/20' :
                  'bg-gray-100 dark:bg-gray-900/20'
                }`}>
                  <Icon className={`w-4 h-4 ${logTextColors[level as keyof typeof logTextColors]}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{level}</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{count}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Showing {filteredLogs.length} of {logs.length} log entries
        </div>

        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600 dark:text-gray-400">Auto-scroll:</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-2 rounded-lg transition-colors ${
              autoScroll 
                ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400' 
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            {autoScroll ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>

      {/* Logs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="max-h-[600px] overflow-y-auto space-y-2 p-4"
        >
          <AnimatePresence>
            {filteredLogs.map((log, index) => {
              const Icon = logIcons[log.level as keyof typeof logIcons] || Info;
              const isExpanded = expandedLogs.has(log.id || `${index}`);
              const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

              return (
                <motion.div
                  key={log.id || `${index}-${log.timestamp}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.02 }}
                  className={`p-4 rounded-xl border-l-4 transition-all duration-200 hover:shadow-md ${
                    logColors[log.level as keyof typeof logColors]
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                      logTextColors[log.level as keyof typeof logTextColors]
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
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

                        <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 ml-auto">
                          <Clock className="w-3 h-3" />
                          <span>{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                          <Calendar className="w-3 h-3 ml-2" />
                          <span>{format(new Date(log.timestamp), 'MMM dd')}</span>
                        </div>
                      </div>

                      <p className="text-sm text-gray-900 dark:text-gray-100 break-words leading-relaxed">
                        {log.message}
                      </p>

                      {hasMetadata && (
                        <div className="mt-3">
                          <motion.button
                            whileHover={{ scale: 1.01 }}
                            onClick={() => toggleLogExpansion(log.id || `${index}`)}
                            className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <span>Metadata ({Object.keys(log.metadata).length} items)</span>
                          </motion.button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-600"
                              >
                                <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
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
                disabled={logsLoading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
              >
                {logsLoading ? (
                  <div className="flex items-center">
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
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
            <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <div className="text-gray-500 dark:text-gray-400 mb-2">
              {searchTerm || levelFilter !== 'all' || componentFilter !== 'all' 
                ? 'No logs match your filters' 
                : 'No logs available'
              }
            </div>
            {(!searchTerm && levelFilter === 'all' && componentFilter === 'all') && (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Logs will appear here as your system generates them
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Logs;