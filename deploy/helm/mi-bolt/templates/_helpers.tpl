{{- define "mi-bolt.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 53 | trimSuffix "-" -}}
{{- end -}}

{{- define "mi-bolt.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimAll "-_." | quote }}
mi-bolt.io/candidate: {{ .Values.candidate.id | quote }}
{{- end -}}

{{- define "mi-bolt.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "mi-bolt.candidateAnnotations" -}}
{{- /* A run id from a values file is a float to Helm; int64 keeps quote from writing 3.7e+10. */}}
mi-bolt.io/publisher-run: {{ .Values.candidate.publisherRunId | int64 | quote }}
mi-bolt.io/web-commit: {{ .Values.candidate.webCommit | quote }}
mi-bolt.io/commerce-commit: {{ .Values.candidate.commerceCommit | quote }}
{{- end -}}
