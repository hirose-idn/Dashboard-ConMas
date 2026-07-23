import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const useDashboard = (endpoint = "/api/dashboard", intervalMs = 5000) => {
  const [data, setData] = useState([]);
  const [shift1, setShift1] = useState(null);
  const [shift2, setShift2] = useState(null);
  const [trend, setTrend] = useState({ shift1: [], shift2: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [dataRes, summaryRes, trendRes] = await Promise.all([
        axios.get(endpoint),
        axios.get(`${endpoint}/summary`),
        axios.get(`${endpoint}/trend`),
      ]);

      if (dataRes.data.success) setData(dataRes.data.data);
      if (summaryRes.data.success) {
        setShift1(summaryRes.data.shift1);
        setShift2(summaryRes.data.shift2);
      }
      if (trendRes.data.success) {
        setTrend({
          shift1: trendRes.data.shift1 || [],
          shift2: trendRes.data.shift2 || [],
        });
      }

      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err.message || "Gagal fetch data");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, intervalMs);
    return () => clearInterval(interval);
  }, [fetchData, intervalMs]);

  return {
    data,
    shift1,
    shift2,
    trend,
    loading,
    error,
    lastUpdated,
    refetch: fetchData,
  };
};

export default useDashboard;
